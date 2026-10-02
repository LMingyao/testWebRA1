import { validateContent } from "../app/shared.js";

export class D1Store {
  constructor(session) {
    this.mode = "d1";
    this.email = session.email;
    this.mediaBase = session.mediaBase;
    this.canUpload = session.canUpload;
  }
  async request(endpoint, options = {}) {
    const response = await fetch(`/api/admin/${endpoint}`, { ...options, cache: "no-store",
      headers: { "X-Gallery-Request": "admin", ...options.headers } });
    if (response.status === 401 || response.redirected)
      throw new Error("登录已过期，请导出草稿后重新登录。");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "后台请求失败。");
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
    const decoded = uploads.map(upload => {
      const bytes = Uint8Array.from(atob(upload.base64), c => c.charCodeAt(0));
      if (bytes.length > 1024 * 1024) throw new Error("云后台每个 WebP 文件最多 1 MB，请先缩小照片或分批处理。");
      return { path: upload.path, bytes };
    });
    let completed = 0;
    if (decoded.length) onProgress({ stage: "upload", completed, total: decoded.length });
    for (const upload of decoded) {
      await this.request("media", { method: "POST", headers: {
        "Content-Type": "image/webp", "X-Media-Path": upload.path,
      }, body: upload.bytes });
      onProgress({ stage: "upload", completed: ++completed, total: decoded.length });
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
