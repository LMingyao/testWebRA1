import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configPath = path.join(root, "cloudflare/wrangler.jsonc");
async function wrangler(args, input) {
  const child = spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    ...args, "--env", "", "--config", configPath],
    { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) throw new Error("Cloudflare 操作失败，请确认 Wrangler 授权与网络后重试。");
  return output;
}

let input = "";
let token = "";
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024) throw new Error("令牌输入过长，未更新上传配置。");
  }
  const values = JSON.parse(input.replace(/^\uFEFF/, ""));
  input = "";
  token = typeof values.token === "string" ? values.token.trim() : "";
  values.token = "";
  if (token.length < 40)
    throw new Error("未收到完整令牌。Windows PowerShell 请用右键或 Shift+Insert 粘贴完整内容，再按 Enter；未更新上传配置。");
  if (!/^github_pat_[A-Za-z0-9_]{40,250}$/.test(token))
    throw new Error("请使用 GitHub fine-grained personal access token，未更新上传配置。");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const { GITHUB_REPO: repo, GITHUB_BRANCH: branch } = config.vars;
  if (repo !== "LMingyao/testWebRA1") throw new Error("上传仓库配置不符，未更新上传配置。");
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Mingyao-Gallery-Setup" },
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("GitHub 暂时无法连接，未更新上传配置。"); }
  if (!response.ok) throw new Error("令牌无效或不能读取目标分支，请检查仓库选择与有效期。未更新上传配置。");
  await wrangler(["secret", "bulk"], JSON.stringify({ GITHUB_TOKEN: token }));
  token = "";
  const secrets = JSON.parse(await wrangler(["secret", "list"]));
  if (!secrets.some(secret => secret.name === "GITHUB_TOKEN"))
    throw new Error("上传凭据已提交，但云端尚未确认，请稍后重试。");
  console.log("照片上传凭据已写入云端。刷新云后台后，可上传照片；首次上传还需验证 Contents 写入权限。");
} catch (error) {
  console.error(error instanceof SyntaxError ? "令牌输入格式无效，未更新上传配置。" : error.message);
  process.exitCode = 1;
} finally { input = ""; token = ""; }
