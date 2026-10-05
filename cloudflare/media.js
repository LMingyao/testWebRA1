import { safeImage } from "../app/shared.js";
import { github, commitFiles } from "./github.js";
import { MEDIA_PATH, DISPLAY_FILE_LIMIT, MEDIA_BATCH_LIMIT } from "../app/media-policy.js";

export class HTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function readLimited(request, limit) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new HTTPError(413, "文件或内容超过大小限制。");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HTTPError(413, "文件或内容超过大小限制。"); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function registerMedia(request, env, fetcher = fetch) {
  if (!env.GITHUB_TOKEN || env.GITHUB_REPO !== "LMingyao/testWebRA1" ||
      !/^[a-zA-Z0-9_./-]+$/.test(env.GITHUB_BRANCH || "") || env.GITHUB_BRANCH.includes(".."))
    throw new HTTPError(503, "尚未配置照片上传凭据；已有照片仍可编辑。");
  const path = request.headers.get("X-Media-Path") || "";
  if (!safeImage(path) || !MEDIA_PATH.test(path) ||
      request.headers.get("Content-Type") !== "image/webp")
    throw new HTTPError(400, "上传路径或图片格式无效。");
  const bytes = await readLimited(request, DISPLAY_FILE_LIMIT);
  const text = new TextDecoder();
  if (bytes.length < 20 || text.decode(bytes.subarray(0, 4)) !== "RIFF" ||
      text.decode(bytes.subarray(8, 12)) !== "WEBP" ||
      !["VP8 ", "VP8L", "VP8X"].includes(text.decode(bytes.subarray(12, 16))))
    throw new HTTPError(400, "请上传有效的 WebP 图片。");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    byte => byte.toString(16).padStart(2, "0")).join("");
  const existing = await env.DB.prepare("SELECT digest FROM gallery_media WHERE path = ?").bind(path).first();
  if (existing) {
    if (existing.digest !== digest) throw new HTTPError(409, "图片路径已存在，不能覆盖。");
    return { path };
  }
  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Mingyao-Gallery" };
  const response = await fetcher(`${endpoint}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, { headers });
  let sha;
  if (response.ok) {
    const file = await response.json();
    // Retry after a committed upload but failed D1 write; Git's blob ID binds the bytes.
    const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const blob = new Uint8Array(prefix.length + bytes.length);
    blob.set(prefix); blob.set(bytes, prefix.length);
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", blob)),
      byte => byte.toString(16).padStart(2, "0")).join("");
    if (file.sha !== expected) throw new HTTPError(409, "仓库中的图片路径已存在，不能覆盖。");
    sha = file.sha;
  } else if (response.status === 404) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const saved = await fetcher(endpoint, { method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({
        message: "Add photography WebP from D1 studio", content: btoa(binary), branch: env.GITHUB_BRANCH,
      }) });
    if (!saved.ok) throw new HTTPError(saved.status === 409 || saved.status === 422 ? 409 : 502,
      "照片保存失败。请稍后重试，或检查服务端 GitHub 权限。");
    sha = (await saved.json()).content?.sha;
  } else throw new HTTPError(502, "照片仓库暂时无法连接。");
  if (!sha) throw new HTTPError(502, "照片保存结果无效。");
  await env.DB.prepare("INSERT INTO gallery_media(path, digest, bytes) VALUES (?, ?, ?) ON CONFLICT(path) DO NOTHING")
    .bind(path, digest, bytes.length).run();
  const stored = await env.DB.prepare("SELECT digest FROM gallery_media WHERE path = ?").bind(path).first();
  if (stored?.digest !== digest) throw new HTTPError(409, "图片路径发生冲突，请重新导入。");
  return { path };
}

export async function registerMediaBatch(request, env, fetcher = fetch) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HTTPError(415,'请使用 JSON 上传。');
  let payload;
  try { payload=JSON.parse(new TextDecoder().decode(await readLimited(request,MEDIA_BATCH_LIMIT))); }
  catch (error) { if (error instanceof HTTPError) throw error; throw new HTTPError(400,'上传内容无效。'); }
  const items=payload?.uploads;
  if (!Array.isArray(items)||items.length<1||items.length>4||items.some(i=>!i||typeof i.path!=='string')||new Set(items.map(i=>i.path)).size!==items.length)
    throw new HTTPError(400,'每次提交一张照片的最多四个尺寸。');
  const photoId=items[0].path?.match(MEDIA_PATH)?.[1];
  const prepared=[];
  for (const item of items) {
    if (!photoId||item.path.match(MEDIA_PATH)?.[1]!==photoId||typeof item.base64!=='string'||item.base64.length>4*Math.ceil(DISPLAY_FILE_LIMIT/3))
      throw new HTTPError(400,'图片路径或大小无效。');
    let bytes; try {
      if (typeof Uint8Array.fromBase64 === 'function') bytes=Uint8Array.fromBase64(item.base64);
      else {
        const binary=atob(item.base64); bytes=new Uint8Array(binary.length);
        for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      }
    } catch { throw new HTTPError(400,'图片编码无效。'); }
    const text=new TextDecoder();
    if (bytes.length<20||bytes.length>DISPLAY_FILE_LIMIT||text.decode(bytes.slice(0,4))!=='RIFF'||text.decode(bytes.slice(8,12))!=='WEBP'||!['VP8 ','VP8L','VP8X'].includes(text.decode(bytes.slice(12,16))))
      throw new HTTPError(400,'请上传 8 MB 以内的有效 WebP。');
    const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
    const digest=hex(await crypto.subtle.digest('SHA-256',bytes));
    const existing=await env.DB.prepare('SELECT digest FROM gallery_media WHERE path = ?').bind(item.path).first();
    if (existing) { if(existing.digest!==digest) throw new HTTPError(409,'图片路径已存在，不能覆盖。'); continue; }
    let committed=false;
    try {
      const file=await github(env,`contents/${item.path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,'GET',undefined,fetcher);
      const prefix=new TextEncoder().encode(`blob ${bytes.length}\0`), blob=new Uint8Array(prefix.length+bytes.length);
      blob.set(prefix);blob.set(bytes,prefix.length);
      if (file.sha!==hex(await crypto.subtle.digest('SHA-1',blob))) throw new HTTPError(409,'仓库图片路径冲突。');
      committed=true;
    } catch(error) { if(error.status!==404) throw error; }
    prepared.push({...item,digest,bytes:bytes.length,committed});
  }
  const pending=prepared.filter(i=>!i.committed);
  if (pending.length) await commitFiles(env,pending,'Add photography display renditions',fetcher);
  for (const item of prepared) {
    await env.DB.prepare('INSERT INTO gallery_media(path,digest,bytes) VALUES(?,?,?) ON CONFLICT(path) DO NOTHING').bind(item.path,item.digest,item.bytes).run();
    const registered=await env.DB.prepare('SELECT digest FROM gallery_media WHERE path = ?').bind(item.path).first();
    if(registered?.digest!==item.digest) throw new HTTPError(409,'图片登记冲突，请重新导入。');
  }
  return {paths:items.map(i=>i.path)};
}
