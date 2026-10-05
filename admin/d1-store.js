import { validateContent } from "../app/shared.js";
import { MEDIA_PATH, DISPLAY_FILE_LIMIT, MEDIA_BATCH_LIMIT } from "../app/media-policy.js";

export class D1Store {
  constructor(session) {
    this.mode = "d1";
    this.email = session.email;
    this.mediaBase = session.mediaBase;
    this.canUpload = session.canUpload;
  }
  async request(endpoint, options = {}) {
    let response;
    try { response = await fetch(`/api/admin/${endpoint}`, { ...options, signal: AbortSignal.timeout(endpoint === "content" || endpoint === "publish" || endpoint === "media-batch" ? 120000 : 30000), cache: "no-store",
      headers: { "X-Gallery-Request": "admin", ...options.headers } }); }
    catch (error) { throw new Error(error.name === 'TimeoutError' ? '请求超时。保存结果尚未确认，请保留草稿并检查云端版本后重试。' : '连接失败，请检查网络并保留草稿。'); }
    if (response.status === 401 || response.redirected)
      throw new Error("登录已过期，请导出草稿后重新登录。");
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || "后台请求失败。"); error.status = response.status; throw error; }
    return result;
  }
  load() { return this.request("content"); }
  image(path) { return new URL(path, this.mediaBase).href; }
  async save(data, revision, uploads, onProgress = () => {}) {
    validateContent(data);
    onProgress({ stage: "save" });
    if (uploads.length && !this.canUpload) throw new Error("尚未配置服务端照片上传；可先保存已有照片的编辑。");
    // Check the version before media commits as well as in the final atomic D1 save.
    if ((await this.load()).revision !== revision)
      throw new Error("内容已更新，请导出草稿后重新连接。");
    const groups = new Map();
    for (const upload of uploads) {
      const id = upload.path.match(MEDIA_PATH)?.[1];
      if (!id) throw new Error('图片路径无效，请重新导入。');
      if (!groups.has(id)) groups.set(id, []);
      if (atob(upload.base64).length > DISPLAY_FILE_LIMIT) throw new Error('展示图片超过 8 MB，请重新导入。');
      groups.get(id).push(upload);
    }
    let completed = 0;
    if (uploads.length) onProgress({stage:'upload',completed,total:uploads.length});
    const batches = [];
    for (const group of groups.values()) {
      let batch = [];
      for (const item of group) {
        if (batch.length && (batch.length >= 4 || JSON.stringify({uploads:[...batch,item]}).length > MEDIA_BATCH_LIMIT)) {
          batches.push(batch); batch = [];
        }
        batch.push(item);
      }
      if (batch.length) batches.push(batch);
    }
    for (const batch of batches) {
      for (let attempt=0;;attempt++) {
        try {
          await this.request('media-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploads:batch})});
          break;
        } catch (error) {
          if (attempt >= 2 || [400,401,403,409,413,415].includes(error.status) || /登录/.test(error.message)) throw error;
          onProgress({stage:'upload',completed,total:uploads.length,retry:attempt+1});
          await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
        }
      }
      onProgress({stage:'upload',completed:completed+=batch.length,total:uploads.length});
    }
    onProgress({ stage: "save" });
    const result = await this.request("content", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, revision }) });
    onProgress({ stage: "done" });
    return result;
  }
  async disconnect() {
    await this.request("logout", { method: "POST" });
    location.assign("/admin/login");
  }
}
export async function getD1Store() {
  const response = await fetch("/api/admin/session", { cache: "no-store" });
  if (!response.ok || response.redirected) return null;
  const session = await response.json();
  return session.mode === "d1" ? new D1Store(session) : null;
}
