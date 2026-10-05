import { validateContent, contentImagePaths } from "../app/shared.js";
import { administrator, authRoute, logout } from "./auth.js";
import { HTTPError, readLimited, registerMedia, registerMediaBatch } from "./media.js";
import { publishedContent } from "../app/publishing.js";
import { listHistory, historyEntry, backupManifest, mediaReport, health, publish } from "./maintenance.js";

const response = (status, body, headers = {}) => new Response(JSON.stringify(body), { status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers } });
export function publicContent(data) {
  return publishedContent(data);
}
async function load(env) {
  const row = await env.DB.prepare("SELECT document, revision FROM gallery_content WHERE id = 1").first();
  if (!row) throw new HTTPError(503, "数据库尚未导入网站内容。");
  return { data: validateContent(JSON.parse(row.document)), revision: row.revision };
}
export async function saveContent(request, env) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HTTPError(415, "请使用 JSON 保存内容。");
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(await readLimited(request, 1000000))); }
  catch (error) { if (error instanceof HTTPError) throw error; throw new HTTPError(400, "内容 JSON 无效。"); }
  try { validateContent(payload.data); } catch { throw new HTTPError(400, "照片信息或网站内容无效。"); }
  if (typeof payload.revision !== "string" || !payload.revision || payload.uploads?.length)
    throw new HTTPError(400, "请先上传照片，再保存内容与版本号。");
  const paths = [...contentImagePaths(payload.data)];
  const missing = await env.DB.prepare(
    "SELECT value AS path FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM gallery_media WHERE path = value) LIMIT 1",
  ).bind(JSON.stringify(paths)).first();
  if (missing) throw new HTTPError(400, "内容引用了尚未上传的图片。");
  const document = JSON.stringify(payload.data);
  const revision = crypto.randomUUID();
  // RETURNING identifies the changed singleton. D1's change count can include
  // history-trigger writes and is therefore not a reliable conflict signal.
  const result = await env.DB.prepare(
    "UPDATE gallery_content SET document = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ? RETURNING revision",
  ).bind(document, revision, payload.revision).first();
  if (result?.revision !== revision) throw new HTTPError(409, "内容已被其他编辑更新。请导出草稿后重新连接。");
  return { revision };
}
async function publishSafely(env, fetcher) {
  try { return await publish(env, fetcher); }
  catch { return {status:"failed",message:"云端内容已保存，静态同步未完成；请检查数据库迁移并重试同步。"}; }
}
async function retryPublication(env, fetcher) {
  for (const delay of [1000,3000,5000]) {
    await new Promise(resolve => setTimeout(resolve,delay));
    if ((await publishSafely(env,fetcher)).status !== "pending") break;
  }
}
export function createWorker({ fetcher = fetch, authenticate = administrator } = {}) {
  return { async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const publicRoute = url.pathname === "/api/content";
    const cors = publicRoute && origin === env.SITE_ORIGIN
      ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
    try {
      if (publicRoute) {
        if (request.method !== "GET") return response(405, { error: "Method not allowed." }, cors);
        const current = await load(env);
        const etag = `"${current.revision}"`;
        const headers = { ...cors, ETag: etag, "Cache-Control": "no-cache, must-revalidate" };
        if (request.headers.get("If-None-Match") === etag) return new Response(null, {status:304,headers});
        return response(200, { ...publicContent(current.data), mediaBase: env.MEDIA_BASE }, headers);
      }
      if (url.pathname === "/api/session") return response(404, { error: "Local editor unavailable." });
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
          (origin !== url.origin || request.headers.get("X-Gallery-Request") !== "admin"))
        return response(403, { error: "保存请求必须来自后台页面。" });
      const authResponse = await authRoute(request, env);
      if (authResponse) return authResponse;
      const publicAssets = ["/admin/login", "/admin/login.js", "/admin/login.css", "/admin/studio-tokens.css", "/app/password.js",
        "/app/design.css", "/app/wordmark.css", "/assets/favicon.svg"];
      const email = await authenticate(request, env, fetcher);
      if (!email && !publicAssets.includes(url.pathname)) {
        if (["GET", "HEAD"].includes(request.method) && ["/", "/admin", "/admin/", "/admin/index.html"].includes(url.pathname))
          return new Response(null, { status: 302, headers: { Location: "/admin/login", "Cache-Control": "no-store" } });
        return response(401, { error: "请登录管理员账号。" });
      }
      if (url.pathname === "/api/admin/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/admin/session" && request.method === "GET")
        return response(200, { mode: "d1", email, mediaBase: env.MEDIA_BASE,
          canUpload: Boolean(env.GITHUB_TOKEN) });
      if (url.pathname === "/api/admin/content") {
        if (request.method === "GET") return response(200, await load(env));
        if (request.method === "PUT") {
          const saved = await saveContent(request, env);
          const publication = env.GITHUB_TOKEN ? await publishSafely(env, fetcher) : {status:"pending",message:"云端已保存；静态分享信息需要配置仓库上传后同步。"};
          if (env.GITHUB_TOKEN && publication.status === "pending" && context?.waitUntil) context.waitUntil(retryPublication(env,fetcher));
          return response(200, {...saved,publication});
        }
        return response(405, { error: "Method not allowed." });
      }
      if (url.pathname === "/api/admin/media" && request.method === "POST")
        return response(200, await registerMedia(request, env, fetcher));
      if (url.pathname === "/api/admin/media-batch" && request.method === "POST")
        return response(200, await registerMediaBatch(request, env, fetcher));
      if (request.method === "GET") {
        if (url.pathname === "/api/admin/history") return response(200, await listHistory(env));
        const entry = url.pathname.match(/^\/api\/admin\/history\/(\d+)$/);
        if (entry) return response(200, await historyEntry(env, Number(entry[1])));
        if (url.pathname === "/api/admin/backup") return response(200, await backupManifest(env));
        if (url.pathname === "/api/admin/media-report") return response(200, await mediaReport(env, fetcher));
        if (url.pathname === "/api/admin/health") return response(200, await health(env, fetcher));
      }
      if (url.pathname === "/api/admin/publish" && request.method === "POST") return response(200, await publishSafely(env, fetcher));
      if (url.pathname.startsWith("/api/")) return response(404, { error: "Unknown endpoint." });
      if (!["GET", "HEAD"].includes(request.method)) return response(405, { error: "Method not allowed." });
      if (url.pathname === "/" || url.pathname === "/admin")
        return Response.redirect(`${url.origin}/admin/`, 302);
      if (url.pathname === "/admin/") url.pathname = "/admin/index.html";
      if (url.pathname === "/admin/login") url.pathname = "/admin/login.html";
      const asset = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "same-origin");
      const preview = url.pathname === "/admin/preview.html";
      headers.set("X-Frame-Options", preview ? "SAMEORIGIN" : "DENY");
      if (preview) headers.set("Content-Security-Policy", "frame-ancestors 'self'");
      return new Response(asset.body, { status: asset.status, headers });
    } catch (error) {
      return response(error instanceof HTTPError ? error.status : 503,
        { error: error instanceof HTTPError ? error.message : "后台服务暂时不可用，请稍后重试。" }, cors);
    }
  } };
}
export default createWorker();
