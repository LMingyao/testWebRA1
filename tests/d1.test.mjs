import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";
import { contentImagePaths } from "../app/shared.js";
import { seedSQL } from "../tools/prepare-d1.mjs";
import { createWorker } from "../cloudflare/worker.js";
import { registerMedia } from "../cloudflare/media.js";
import { administrator, SESSION_COOKIE } from "../cloudflare/auth.js";
import { derivePassword, encode64, credentialMAC, PASSWORD_ITERATIONS } from "../app/password.js";
import { D1Store } from "../admin/d1-store.js";

const schema = await readFile(new URL("../cloudflare/migrations/0001_gallery.sql", import.meta.url), "utf8");
const authSchema = await readFile(new URL("../cloudflare/migrations/0002_admin_auth.sql", import.meta.url), "utf8");
function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(schema);
  sqlite.exec(authSchema);
  const data = structuredClone(fixture);
  data.site.about = "Photographer's biography'; SELECT 1; --";
  data.photos[1].published = false;
  const media = [...contentImagePaths(data)].map(path => ({ path, bytes: 0, digest: null }));
  sqlite.exec(seedSQL(data, media));
  const DB = { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    const query = args => ({ bind: (...values) => query(values),
      first: async () => stmt.get(...args) || null,
      run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
    });
    return query([]);
  } };
  return { sqlite, data, DB };
}
function setup(t) {
  const result = database(t);
  const env = { DB: result.DB, SITE_ORIGIN: "https://mingyaophoto.com", MEDIA_BASE: "https://mingyaophoto.com/",
    ASSETS: { fetch: async () => new Response("asset") } };
  const worker = createWorker({ authenticate: async req => req.headers.get("Authorization") === "test-admin" ? "owner@example.com" : null });
  const request = (route, { data, revision, origin = "https://studio.test", auth = true, method = "GET", headers = {}, body } = {}) =>
    worker.fetch(new Request(`https://studio.test${route}`, { method,
      headers: { ...(auth ? { Authorization: "test-admin" } : {}), Origin: origin,
        "X-Gallery-Request": "admin", ...(data ? { "Content-Type": "application/json" } : {}), ...headers },
      body: data ? JSON.stringify({ data, revision }) : body }), env);
  return { ...result, env, request };
}
test("D1 schema and seed preserve content, SQL quotes, media and ordering; reseeding rejects", t => {
  const { sqlite, data } = database(t);
  assert.deepEqual(JSON.parse(sqlite.prepare("SELECT document FROM gallery_content").get().document), data);
  assert.deepEqual(sqlite.prepare("SELECT id, position FROM gallery_photos ORDER BY position").all().map(row => ({ ...row })),
    [{ id: "photo-one", position: 0 }, { id: "photo-two", position: 1 }]);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM gallery_media").get().count, contentImagePaths(data).size);
  assert.throws(() => sqlite.exec(seedSQL(data, [])), /UNIQUE/);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM gallery_content").get().count, 1);
});
test("D1 denies unauthenticated admin and assets; public feed omits hidden works and limits CORS", async t => {
  const { request } = setup(t);
  for (const path of ["/api/admin/session", "/api/admin/content", "/app/shared.js"])
    assert.equal((await request(path, { auth: false })).status, 401);
  assert.equal((await request("/admin/", { auth: false })).headers.get("Location"), "/admin/login");
  assert.equal((await request("/admin/login", { auth: false })).status, 200);
  const publicFeed = await request("/api/content", { auth: false, origin: "https://mingyaophoto.com" });
  assert.equal(publicFeed.headers.get("Access-Control-Allow-Origin"), "https://mingyaophoto.com");
  assert.equal(publicFeed.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await publicFeed.json()).photos.map(photo => photo.id), ["photo-one"]);
  assert.equal((await request("/api/content", { auth: false, origin: "https://evil.test" })).headers.get("Access-Control-Allow-Origin"), null);
  assert.equal((await request("/api/admin/content")).status, 200);
  assert.equal((await request("/admin/")).headers.get("Cache-Control"), "no-store");
});
test("D1 saves atomically, rejects stale and missing media, keeps bounded history", async t => {
  const { request, data, sqlite } = setup(t);
  let { revision } = await (await request("/api/admin/content")).json();
  const stale = revision;
  data.photos.reverse();
  data.site.location = "Toronto";
  const saved = await request("/api/admin/content", { method: "PUT", data, revision });
  assert.equal(saved.status, 200);
  revision = (await saved.json()).revision;
  assert.equal((await request("/api/admin/content", { method: "PUT", data, revision: stale })).status, 409);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM gallery_history").get().n, 1);
  const invalid = structuredClone(data);
  invalid.photos[0].image = "media/not-uploaded.webp";
  assert.equal((await request("/api/admin/content", { method: "PUT", data: invalid, revision })).status, 400);
  assert.equal((await request("/api/admin/content", { method: "PUT", data, revision, origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/api/admin/content", { method: "PUT", data, revision, headers: { "X-Gallery-Request": "" } })).status, 403);
  for (let i = 0; i < 25; i++) {
    data.site.location = `Location ${i}`;
    const next = await request("/api/admin/content", { method: "PUT", data, revision });
    assert.equal(next.status, 200);
    revision = (await next.json()).revision;
  }
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM gallery_history").get().n, 20);
  assert.equal(JSON.parse(sqlite.prepare("SELECT document FROM gallery_content").get().document).site.location, "Location 24");
});
test("D1 rejects invalid and oversized content without changing its version", async t => {
  const { request, data } = setup(t);
  const original = await (await request("/api/admin/content")).json();
  data.photos[0].image = "../.env";
  assert.equal((await request("/api/admin/content", { method: "PUT", data, revision: original.revision })).status, 400);
  assert.equal((await request("/api/admin/content", { method: "PUT", body: "x".repeat(1000001), headers: { "Content-Type": "application/json" } })).status, 413);
  assert.equal((await (await request("/api/admin/content")).json()).revision, original.revision);
});

const authSalt = encode64(new Uint8Array(16).fill(5));
const authPepper = encode64(new Uint8Array(32).fill(9));
const authProof = await derivePassword("test-only-password-long-enough", authSalt);
const authRecord = { salt: authSalt, pepper: authPepper, iterations: PASSWORD_ITERATIONS,
  version: crypto.randomUUID(), verifier: await credentialMAC(authPepper, authProof) };
function authSetup(t) {
  const { env, sqlite } = setup(t);
  env.AUTH_CREDENTIALS = JSON.stringify(authRecord);
  const worker = createWorker();
  const request = (route, { method = "GET", proof = encode64(authProof), cookie, origin = "https://studio.test",
    ip = "192.0.2.1", headers = {}, body } = {}) => worker.fetch(new Request(`https://studio.test${route}`, {
      method, headers: { Origin: origin, "X-Gallery-Request": "admin", "Content-Type": "application/json",
        "CF-Connecting-IP": ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: method === "POST" ? body ?? JSON.stringify({ proof }) : undefined,
    }), env);
  return { env, sqlite, request };
}
test("password login creates protected sessions; logout revokes the token and expiry rejects it", async t => {
  const { request, sqlite, env } = authSetup(t);
  const config = await (await request("/api/auth/config")).json();
  assert.deepEqual(config, { salt: authSalt, iterations: PASSWORD_ITERATIONS });
  assert.equal((await request("/api/admin/content")).status, 401);
  const login = await request("/api/auth/login", { method: "POST" });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("Set-Cookie");
  assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict; Max-Age=28800/);
  const cookie = setCookie.split(";")[0];
  assert.equal((await request("/api/admin/content", { cookie })).status, 200);
  assert.equal(sqlite.prepare("SELECT token_hash FROM admin_sessions").get().token_hash.includes(cookie.split("=")[1]), false);
  assert.equal(await administrator(new Request("http://studio.test/admin/", { headers: { Cookie: cookie } }), env), null);
  const changed = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
  assert.equal((await request("/api/admin/content", { cookie: changed })).status, 401);
  assert.equal((await request("/api/admin/logout", { method: "POST", cookie, origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/api/admin/logout", { method: "POST", cookie })).status, 200);
  assert.equal((await request("/api/admin/content", { cookie })).status, 401);
  const second = await request("/api/auth/login", { method: "POST" });
  const secondCookie = second.headers.get("Set-Cookie").split(";")[0];
  sqlite.prepare("UPDATE admin_sessions SET expires_at = 0").run();
  assert.equal((await request("/api/admin/content", { cookie: secondCookie })).status, 401);
});
test("password rotation and missing secrets reject old sessions; remote dev bypass remains impossible", async t => {
  const { request, env } = authSetup(t);
  const login = await request("/api/auth/login", { method: "POST" });
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  env.AUTH_CREDENTIALS = JSON.stringify({ ...authRecord, version: crypto.randomUUID() });
  assert.equal((await request("/api/admin/content", { cookie })).status, 401);
  env.AUTH_CREDENTIALS = "";
  assert.equal((await request("/api/auth/login", { method: "POST" })).status, 503);
  assert.equal((await request("/api/admin/content", { cookie })).status, 401);
  assert.equal(await administrator(new Request("https://studio.test/admin/", { headers: { Cookie: cookie } }), { LOCAL_DEV: "1" }), null);
  assert.equal(await administrator(new Request("http://127.0.0.1:8787/admin/"), { LOCAL_DEV: "1" }), "local-development");
});
test("password attempts are limited atomically by IP and globally; expired buckets are cleared", async t => {
  const { request, sqlite } = authSetup(t);
  const wrong = encode64(new Uint8Array(32));
  const attempts = await Promise.all(Array.from({ length: 8 }, () => request("/api/auth/login", { method: "POST", proof: wrong })));
  assert.equal(attempts.filter(result => result.status === 401).length, 5);
  assert.equal(attempts.filter(result => result.status === 429).length, 3);
  assert.ok(Number(attempts.find(result => result.status === 429).headers.get("Retry-After")) > 0);
  for (let i = 0; i < 22; i++) assert.equal((await request("/api/auth/login", { method: "POST", proof: wrong, ip: `192.0.2.${i + 2}` })).status, 401);
  assert.equal((await request("/api/auth/login", { method: "POST", ip: "192.0.2.100" })).status, 429);
  assert.equal(sqlite.prepare("SELECT attempts FROM admin_login_limits WHERE bucket LIKE 'global:%'").get().attempts, 30);
  sqlite.prepare("INSERT INTO admin_login_limits VALUES ('expired', 1, 0)").run();
  await request("/api/auth/login", { method: "POST" });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_login_limits WHERE bucket = 'expired'").get().n, 0);
});
test("login rejects CSRF, unsupported methods, malformed proofs and excessive request bodies", async t => {
  const { request } = authSetup(t);
  assert.equal((await request("/api/auth/login", { method: "POST", origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/api/auth/login", { method: "POST", headers: { "X-Gallery-Request": "" } })).status, 403);
  assert.equal((await request("/api/auth/login")).status, 405);
  assert.equal((await request("/api/auth/login", { method: "POST", proof: "short" })).status, 400);
  assert.equal((await request("/api/auth/login", { method: "POST", body: "{" })).status, 400);
  assert.equal((await request("/api/auth/login", { method: "POST", body: "x".repeat(2049) })).status, 413);
  assert.equal((await request("/api/admin/session", { cookie: `${SESSION_COOKIE}=forged` })).status, 401);
});
test("media proxy commits only image bytes, registers successful uploads and retries safely", async t => {
  const { DB, sqlite } = database(t);
  const env = { DB, GITHUB_TOKEN: "server-secret", GITHUB_REPO: "LMingyao/testWebRA1", GITHUB_BRANCH: "review" };
  const path = "media/photo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-640.webp";
  const bytes = new Uint8Array(20);
  bytes.set(new TextEncoder().encode("RIFF")); bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  const req = (target = path, body = bytes) => new Request("https://studio.test/api/admin/media", {
    method: "POST", headers: { "Content-Type": "image/webp", "X-Media-Path": target }, body });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return options.method === "PUT" ? new Response(JSON.stringify({ content: { sha: "committed" } }))
      : new Response("{}", { status: 404 });
  };
  assert.deepEqual(await registerMedia(req(), env, fetcher), { path });
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.branch, "review");
  assert.deepEqual(Buffer.from(body.content, "base64"), Buffer.from(bytes));
  assert.equal(sqlite.prepare("SELECT bytes FROM gallery_media WHERE path = ?").get(path).bytes, 20);
  await registerMedia(req(), env, fetcher);
  assert.equal(calls.length, 2);
  const changed = bytes.slice(); changed[19] = 1;
  await assert.rejects(() => registerMedia(req(path, changed), env, fetcher), /不能覆盖/);
  await assert.rejects(() => registerMedia(req("media/../secret.webp"), env, fetcher), /无效/);
  await assert.rejects(() => registerMedia(req(), { DB }, fetcher), /尚未配置/);
  await assert.rejects(() => registerMedia(req(path, new Uint8Array(1048577)), env, fetcher), /大小限制/);
});
test("media retry after GitHub success and D1 failure verifies Git blob identity", async t => {
  const { DB } = database(t);
  const bytes = Buffer.from("RIFFxxxxWEBPVP8 xxxx");
  const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const env = { DB, GITHUB_TOKEN: "secret", GITHUB_REPO: "LMingyao/testWebRA1", GITHUB_BRANCH: "review" };
  const req = path => new Request("https://studio.test/api/admin/media", { method: "POST", headers: {
    "Content-Type": "image/webp", "X-Media-Path": path }, body: bytes });
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(JSON.stringify({ sha })); };
  await registerMedia(req("media/photo-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb-640.webp"), env, fetcher);
  assert.equal(calls, 1);
  await assert.rejects(() => registerMedia(req("media/photo-cccccccc-cccc-cccc-cccc-cccccccccccc-640.webp"), env,
    async () => new Response(JSON.stringify({ sha: "wrong" }))), /不能覆盖/);
});
test("D1 adapter prechecks revisions, uploads sequentially and sends no token or bytes to content save", async () => {
  const store = new D1Store({ email: "owner", mediaBase: "https://mingyaophoto.com/", canUpload: true });
  const calls = [];
  store.request = async (endpoint, options = {}) => {
    calls.push({ endpoint, options });
    return endpoint === "content" && !options.method ? { revision: "current" } : { revision: "next" };
  };
  await assert.rejects(() => store.save(fixture, "old", [{ base64: "" }]), /内容已更新/);
  assert.equal(calls.length, 1);
  calls.length = 0;
  const result = await store.save(fixture, "current", [{ path: "media/photo.webp", base64: "YWJj" }]);
  assert.equal(result.revision, "next");
  assert.deepEqual(calls.map(call => call.endpoint), ["content", "media", "content"]);
  assert.deepEqual(JSON.parse(calls[2].options.body), { data: fixture, revision: "current" });
  assert.equal(store.image("media/photo.webp"), "https://mingyaophoto.com/media/photo.webp");
});
