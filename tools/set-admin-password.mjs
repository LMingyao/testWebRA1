import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { derivePassword, credentialMAC, PASSWORD_ITERATIONS } from "../app/password.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const configPath = path.join(root, "cloudflare/wrangler.jsonc");
const authURL = "https://mingyao-gallery-admin.mingyao-photography.workers.dev/api/auth/config";

async function checkAuth() {
  const child = spawn(process.execPath, [wrangler, "whoami", "--json", "--config", configPath],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.resume();
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  let info;
  try { info = JSON.parse(output); }
  catch { throw new Error("无法检查 Cloudflare 授权，请检查网络连接后重试。"); }
  if (info.loggedIn === false) return 2;
  if (code !== 0 || !info.loggedIn) throw new Error("Cloudflare 授权检查失败，请重新授权后重试。");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!info.accounts?.some(account => account.id === config.account_id))
    throw new Error("当前 Cloudflare 账号与网站配置不符，请使用网站所属账号授权。");
  if (info.authType === "OAuth Token" && !info.tokenPermissions?.includes("workers_scripts:write")) return 2;
  console.log("Cloudflare 账号授权已确认。");
  return 0;
}

// Called by the masked PowerShell prompt. Never put credentials in command-line
// arguments, environment variables, files, logs, or the repository.
let input = "";
try {
  if (process.argv.includes("--check-auth")) {
    process.exitCode = await checkAuth();
  } else {
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 8192) throw new Error("Password input is too large.");
    }
    const values = JSON.parse(input.replace(/^\uFEFF/, ""));
    input = "";
    if (typeof values.password !== "string" || values.password !== values.confirmation)
      throw new Error("两次密码不一致，未更新云端密码。");
    if ([...values.password].length < 8 || [...values.password].length > 128)
      throw new Error("请使用 8–128 个字符的密码或长口令，未更新云端密码。");
    const salt = randomBytes(16).toString("base64url");
    const pepper = randomBytes(32).toString("base64url");
    const proof = await derivePassword(values.password, salt);
    values.password = "";
    values.confirmation = "";
    const record = { salt, pepper, iterations: PASSWORD_ITERATIONS, version: randomUUID(),
      verifier: await credentialMAC(pepper, proof) };
    proof.fill(0);
    const child = spawn(process.execPath, [wrangler,
      "secret", "bulk", "--env", "", "--config", configPath],
      { cwd: root, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ AUTH_CREDENTIALS: JSON.stringify(record) }));
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    if (code !== 0) throw new Error("云端密码设置失败，请检查 Cloudflare 登录后重试。");
    let confirmed = false;
    for (let attempt = 0; attempt < 3 && !confirmed; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const response = await fetch(authURL, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        const config = await response.json();
        confirmed = response.ok && config.salt === salt && config.iterations === PASSWORD_ITERATIONS;
      } catch { /* Report a fixed message without credential material. */ }
    }
    if (!confirmed) throw new Error("密码已提交，但尚未确认云端生效。请稍后检查后台登录页，或重新运行设置脚本。");
    console.log("管理员密码已设置；之前的登录会话自动失效。请打开云后台登录。");
  }
} catch (error) {
  // JSON parse errors can include credential excerpts; report a fixed message.
  console.error(error instanceof SyntaxError ? "密码输入格式无效，未更新云端密码。" : error.message);
  process.exitCode = 1;
} finally { input = ""; }
