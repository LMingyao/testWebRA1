import { encode64, decode64, credentialMAC, PASSWORD_ITERATIONS } from "../app/password.js";
import { HTTPError, readLimited } from "./media.js";

export const SESSION_SECONDS = 8 * 3600;
export const SESSION_COOKIE = "__Host-gallery_session";
const encoder = new TextEncoder();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", ...headers } });
function credentials(env) {
  try {
    const data = JSON.parse(env.AUTH_CREDENTIALS);
    if (data.iterations !== PASSWORD_ITERATIONS || !/^[a-f0-9-]{36}$/.test(data.version) ||
        decode64(data.salt).length !== 16 || decode64(data.pepper).length !== 32 || decode64(data.verifier).length !== 32)
      return null;
    return data;
  } catch { return null; }
}
function sessionToken(request) {
  const matches = (request.headers.get("Cookie") || "").split(";").map(value => value.trim())
    .filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
async function tokenHash(token) {
  return encode64(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}
function cookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
export async function administrator(request, env) {
  const url = new URL(request.url);
  if (env.LOCAL_DEV === "1" && ["127.0.0.1", "localhost"].includes(url.hostname))
    return "local-development";
  const config = credentials(env);
  const token = sessionToken(request);
  if (url.protocol !== "https:" || !config || !token) return null;
  const session = await env.DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ? AND credential_version = ?",
  ).bind(await tokenHash(token), nowSeconds(), config.version).first();
  return session ? "管理员" : null;
}
async function reserveAttempt(env, key, limit, expiry) {
  // RETURNING makes the rate limit atomic even across concurrent Worker instances.
  return env.DB.prepare(
    "INSERT INTO admin_login_limits(bucket, attempts, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ? RETURNING attempts",
  ).bind(key, expiry, limit).first();
}
export async function authRoute(request, env) {
  const url = new URL(request.url);
  if (!["/api/auth/config", "/api/auth/login"].includes(url.pathname)) return null;
  const config = credentials(env);
  if (url.protocol !== "https:" || !config)
    return json(503, { error: "后台密码尚未设置，请联系网站管理员。" });
  if (url.pathname === "/api/auth/config") {
    if (request.method !== "GET") return json(405, { error: "Method not allowed." });
    return json(200, { salt: config.salt, iterations: config.iterations });
  }
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HTTPError(415, "登录请求格式无效。");
  const now = nowSeconds();
  const window = Math.floor(now / 900);
  const expiry = (window + 1) * 900;
  await env.DB.prepare("DELETE FROM admin_login_limits WHERE expires_at <= ?").bind(now).run();
  const global = await reserveAttempt(env, `global:${window}`, 30, expiry);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = await credentialMAC(config.pepper, encoder.encode(`login-ip:${ip}`));
  const local = global && await reserveAttempt(env, `${window}:${ipKey}`, 5, expiry);
  if (!local) return json(429, { error: "登录尝试过多，请稍后再试。" }, { "Retry-After": String(expiry - now) });
  let proof;
  try {
    const data = JSON.parse(new TextDecoder().decode(await readLimited(request, 2048)));
    proof = decode64(data.proof);
    if (proof.length !== 32) throw new Error("Invalid proof.");
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    return json(400, { error: "登录请求格式无效。" });
  }
  const mac = decode64(await credentialMAC(config.pepper, proof));
  const expected = decode64(config.verifier);
  let difference = 0;
  for (let i = 0; i < mac.length; i++) difference |= mac[i] ^ expected[i];
  if (difference) return json(401, { error: "密码不正确。" });
  const token = encode64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ? OR credential_version != ?")
    .bind(now, config.version).run();
  await env.DB.prepare("INSERT INTO admin_sessions(token_hash, credential_version, expires_at) VALUES (?, ?, ?)")
    .bind(await tokenHash(token), config.version, now + SESSION_SECONDS).run();
  await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash NOT IN (SELECT token_hash FROM admin_sessions ORDER BY rowid DESC LIMIT 10)").run();
  return json(200, { ok: true }, { "Set-Cookie": cookie(token, SESSION_SECONDS) });
}
export async function logout(request, env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await tokenHash(token)).run();
  return json(200, { ok: true }, { "Set-Cookie": cookie("", 0) });
}
