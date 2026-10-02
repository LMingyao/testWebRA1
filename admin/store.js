import { validateContent, contentImagePaths } from "../app/shared.js";
const API = "https://api.github.com";
export class LocalStore {
  constructor(token) {
    this.token = token;
    this.mode = "local";
  }
  async load() {
    const res = await fetch("/api/content", { cache: "no-store" });
    if (!res.ok) throw new Error("本机内容读取失败");
    return res.json();
  }
  image(path) {
    return "../" + path;
  }
  async save(data, revision, uploads) {
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": this.token,
      },
      body: JSON.stringify({ data, revision, uploads }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    return result;
  }
}
export class GitHubStore {
  constructor(token, repo, branch) {
    if (
      repo !== "LMingyao/testWebRA1" ||
      !branch ||
      !/^[a-zA-Z0-9_./-]+$/.test(branch) ||
      branch.includes("..")
    )
      throw new Error("仓库或分支无效");
    this.token = token;
    this.repo = repo;
    this.branch = branch;
    this.mode = "github";
  }
  async request(endpoint, method = "GET", body) {
    const response = await fetch(`${API}/repos/${this.repo}/${endpoint}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(
        response.status === 409 || response.status === 422
          ? "仓库有新更改。请导出草稿后重新连接，避免覆盖其他编辑。"
          : `GitHub ${response.status}: ${result.message || "请求失败"}`,
      );
    }
    return response.json();
  }
  async load() {
    const file = await this.request(
      `contents/content/gallery.json?ref=${encodeURIComponent(this.branch)}`,
    );
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, "")), (c) =>
      c.charCodeAt(0),
    );
    return {
      data: validateContent(JSON.parse(new TextDecoder().decode(bytes))),
      revision: file.sha,
    };
  }
  image(path) {
    return `https://raw.githubusercontent.com/${this.repo}/${encodeURIComponent(this.branch)}/${path}`;
  }
  async save(data, revision, uploads) {
    validateContent(data);
    const ref = await this.request(
      `git/ref/heads/${encodeURIComponent(this.branch)}`,
    );
    const parent = await this.request(`git/commits/${ref.object.sha}`);
    // Read the content from the exact parent tree to detect edits since login.
    const rootTree = await this.request(
      `git/trees/${parent.tree.sha}?recursive=1`,
    );
    if (rootTree.truncated)
      throw new Error("仓库目录过大，无法安全校验，请使用本机管理。");
    if (
      rootTree.tree.find((f) => f.path === "content/gallery.json")?.sha !==
      revision
    )
      throw new Error("内容已被其他编辑更新，请导出草稿后重新连接。");
    const existing = new Set(
      rootTree.tree.filter((f) => f.type === "blob").map((f) => f.path),
    );
    const uploaded = new Set(uploads.map((u) => u.path));
    if (
      uploaded.size !== uploads.length ||
      uploads.some((u) => existing.has(u.path))
    )
      throw new Error("上传文件路径重复，请重新导入照片。");
    for (const file of contentImagePaths(data))
      if (!existing.has(file) && !uploaded.has(file))
        throw new Error(`图片不存在：${file}`);
    const tree = [];
    for (const upload of uploads) {
      const blob = await this.request("git/blobs", "POST", {
        content: upload.base64,
        encoding: "base64",
      });
      tree.push({
        path: upload.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }
    const blob = await this.request("git/blobs", "POST", {
      content: JSON.stringify(data, null, 2) + "\n",
      encoding: "utf-8",
    });
    tree.push({
      path: "content/gallery.json",
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
    const nextTree = await this.request("git/trees", "POST", {
      base_tree: parent.tree.sha,
      tree,
    });
    const commit = await this.request("git/commits", "POST", {
      message: "Update photography collection from studio",
      tree: nextTree.sha,
      parents: [ref.object.sha],
    });
    // Fast-forward only: concurrent branch changes reject, never force-overwrite.
    await this.request(
      `git/refs/heads/${encodeURIComponent(this.branch)}`,
      "PATCH",
      { sha: commit.sha, force: false },
    );
    return { revision: blob.sha, url: commit.html_url };
  }
  disconnect() {
    this.token = "";
  }
}
export async function getLocalStore() {
  if (location.hostname !== "127.0.0.1") return null;
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (!res.ok) return null;
    const session = await res.json();
    return session.mode === "local" ? new LocalStore(session.token) : null;
  } catch {
    return null;
  }
}
