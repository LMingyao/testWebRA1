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
import { administrator } from "../cloudflare/access.js";
import { D1Store } from "../admin/d1-store.js";

const schema = await readFile(new URL("../cloudflare/migrations/0001_gallery.sql", import.meta.url), "utf8");
function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(schema);
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
  for (const path of ["/api/admin/session", "/api/admin/content", "/admin/", "/app/shared.js"])
    assert.equal((await request(path, { auth: false })).status, 401);
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

const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const publicKey = { ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "test-key" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
async function assertion(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({
    iss: "https://gallery-test.cloudflareaccess.com", aud: ["gallery-aud"], sub: "owner-id",
    email: "owner@example.com", iat: now - 10, exp: now + 3600, ...overrides,
  })}`;
  return body + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(body))).toString("base64url");
}
test("Access verifies real signatures and rejects expiry, wrong audience/issuer/email and tampering", async () => {
  const env = { ACCESS_TEAM_DOMAIN: "gallery-test.cloudflareaccess.com", ACCESS_AUD: "gallery-aud", ADMIN_EMAILS: "owner@example.com" };
  const certs = async () => new Response(JSON.stringify({ keys: [publicKey] }));
  const req = token => new Request("https://studio.test/admin/", { headers: { "Cf-Access-Jwt-Assertion": token } });
  assert.equal(await administrator(req(await assertion()), env, certs), "owner@example.com");
  for (const overrides of [{ exp: 0 }, { aud: ["other"] }, { iss: "https://evil.test" }, { email: "outsider@example.com" }, { iat: Date.now() / 1000 + 3600 }])
    assert.equal(await administrator(req(await assertion(overrides)), env, certs), null);
  const token = await assertion();
  const parts = token.split(".");
  parts[1] = encode({ ...JSON.parse(Buffer.from(parts[1], "base64url").toString()), exp: 9999999999 });
  assert.equal(await administrator(req(parts.join(".")), env, certs), null);
  assert.equal(await administrator(new Request("https://studio.test/admin/", { headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" } }), env, certs), null);
  assert.equal(await administrator(req(token), {}), null);
  assert.equal(await administrator(req(token), { LOCAL_DEV: "1" }), null);
  assert.equal(await administrator(new Request("http://127.0.0.1:8787/admin/"), { LOCAL_DEV: "1" }), "local-development");
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
