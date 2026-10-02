import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { derivePassword, credentialMAC, PASSWORD_ITERATIONS } from "../app/password.js";

// Called by the masked PowerShell prompt. Never put credentials in command-line
// arguments, environment variables, files, logs, or the repository.
let input = "";
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw new Error("Password input is too large.");
  }
  const values = JSON.parse(input.replace(/^\uFEFF/, ""));
  input = "";
  if (typeof values.password !== "string" || values.password !== values.confirmation)
    throw new Error("两次密码不一致，未更新云端密码。");
  if ([...values.password].length < 16 || [...values.password].length > 128)
    throw new Error("请使用 16–128 个字符的密码或长口令，未更新云端密码。");
  const salt = randomBytes(16).toString("base64url");
  const pepper = randomBytes(32).toString("base64url");
  const proof = await derivePassword(values.password, salt);
  values.password = "";
  values.confirmation = "";
  const record = { salt, pepper, iterations: PASSWORD_ITERATIONS, version: randomUUID(),
    verifier: await credentialMAC(pepper, proof) };
  proof.fill(0);
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const child = spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    "secret", "bulk", "--env", "", "--config", path.join(root, "cloudflare/wrangler.jsonc")],
    { cwd: root, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify({ AUTH_CREDENTIALS: JSON.stringify(record) }));
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) throw new Error("云端密码设置失败，请检查 Cloudflare 登录后重试。");
  console.log("管理员密码已设置；之前的登录会话自动失效。请打开云后台登录。");
} catch (error) {
  // JSON parse errors can include credential excerpts; report a fixed message.
  console.error(error instanceof SyntaxError ? "密码输入格式无效，未更新云端密码。" : error.message);
  process.exitCode = 1;
} finally { input = ""; }
