import { gitFixture } from "./github-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";
import { contentImagePaths } from "../app/shared.js";
import { seedSQL } from "../tools/prepare-d1.mjs";
import { createWorker } from "../cloudflare/worker.js";
import { registerMedia, registerMediaBatch } from "../cloudflare/media.js";
import { health, mediaReport, publish } from "../cloudflare/maintenance.js";
import { administrator, SESSION_COOKIE } from "../cloudflare/auth.js";
import { derivePassword, encode64, credentialMAC, PASSWORD_ITERATIONS } from "../app/password.js";
import { D1Store } from "../admin/d1-store.js";
import { defaultCollection, collections, editableCollections } from "../app/config.js";
import { renderEditorial } from "../app/editorial.js";

const schema = await readFile(new URL("../cloudflare/migrations/0001_gallery.sql", import.meta.url), "utf8");
const authSchema = await readFile(new URL("../cloudflare/migrations/0002_admin_auth.sql", import.meta.url), "utf8");
const awaitedPublicationSchema = await readFile(new URL("../cloudflare/migrations/0003_publication.sql", import.meta.url), "utf8");
function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(schema);
  sqlite.exec(authSchema);
  sqlite.exec(awaitedPublicationSchema);
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
  for (const path of ["/api/admin/session", "/api/admin/content", "/app/shared.js", "/admin/ui.js", "/admin/editor-views.js", "/admin/upload-dropzone.js", "/admin/admin.css"])
    assert.equal((await request(path, { auth: false })).status, 401);
  assert.equal((await request("/admin/", { auth: false })).headers.get("Location"), "/admin/login");
  assert.equal((await request("/admin/login", { auth: false })).status, 200);
  assert.equal((await request("/app/design.css", { auth: false })).status, 200);
  assert.equal((await request("/admin/studio-tokens.css", { auth: false })).status, 200);
  const publicFeed = await request("/api/content", { auth: false, origin: "https://mingyaophoto.com" });
  assert.equal(publicFeed.headers.get("Access-Control-Allow-Origin"), "https://mingyaophoto.com");
  assert.equal(publicFeed.headers.get("Cache-Control"), "no-cache, must-revalidate");
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
  const published = data.photos.find(photo => photo.published);
  published.presentation = "solo";
  published.group = "Selected sequence";
  const saved = await request("/api/admin/content", { method: "PUT", data, revision });
  assert.equal(saved.status, 200);
  revision = (await saved.json()).revision;
  const publicPhoto = (await (await request("/api/content", { auth: false })).json()).photos[0];
  assert.equal(publicPhoto.presentation, "solo");
  assert.equal(publicPhoto.group, "Selected sequence");
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

test("successive admin saves change public navigation, entry, equipment and contact while stale writes reject", async t => {
  const { request, data } = setup(t);
  let { revision } = await (await request("/api/admin/content")).json();
  const originalRevision = revision;
  const config = editableCollections(data);
  config.default = "aviation";
  config.selected.label = "Highlights";
  config.order = ["aviation", "all"];
  data.site.gear = ["Camera A", "Lens A"];
  data.site.email = "first@example.com";
  const first = await request("/api/admin/content", { method: "PUT", data, revision });
  assert.equal(first.status, 200); revision = (await first.json()).revision;
  let feed = await (await request("/api/content", { auth: false })).json();
  assert.equal(defaultCollection(feed), "aviation");
  assert.deepEqual(collections(feed).map(item => item.label), ["Aviation", "Highlights"]);
  let main = { innerHTML: "" };
  renderEditorial(main, feed, "about");
  assert.equal((main.innerHTML.match(/<li>/g) || []).length, 2);
  config.default = "all";
  data.categories[0].visible = false;
  data.site.gear = ["Camera B"];
  data.site.email = "second@example.com";
  const second = await request("/api/admin/content", { method: "PUT", data, revision });
  assert.equal(second.status, 200);
  feed = await (await request("/api/content", { auth: false })).json();
  assert.equal(defaultCollection(feed), "all");
  assert.deepEqual(collections(feed).map(item => item.label), ["Highlights"]);
  assert.equal(feed.photos.length, 0);
  renderEditorial(main, feed, "about");
  assert.equal((main.innerHTML.match(/<li>/g) || []).length, 1);
  renderEditorial(main, feed, "contact");
  assert.match(main.innerHTML, /mailto:second@example.com/);
  assert.equal((await request("/api/admin/content", { method: "PUT", data, revision: originalRevision })).status, 409);
  const reopened = await (await request("/api/admin/content")).json();
  assert.equal(reopened.data.photos.length, data.photos.length);
  assert.deepEqual(reopened.data.site.gear, ["Camera B"]);
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
  assert.deepEqual(calls.map(call => call.endpoint), ["content", "media-batch", "content"]);
  assert.deepEqual(JSON.parse(calls[2].options.body), { data: fixture, revision: "current" });
  assert.equal(store.image("media/photo.webp"), "https://mingyaophoto.com/media/photo.webp");
});

test("private draft preview is frameable only by its own origin and still requires login", async t => {
  const { request } = setup(t);
  assert.equal((await request("/admin/preview.html", { auth: false })).status, 401);
  assert.equal((await request("/admin/preview.js", { auth: false })).status, 401);
  const preview = await request("/admin/preview.html");
  assert.equal(preview.headers.get("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(preview.headers.get("Content-Security-Policy"), "frame-ancestors 'self'");
  assert.equal((await request("/admin/")).headers.get("X-Frame-Options"), "DENY");
});

test("upload progress counts only completed versions and never reports success on failed save", async () => {
  const store = new D1Store({ canUpload: true }), events = [];
  store.request = async (endpoint, options = {}) => {
    if (endpoint === "content" && !options.method) return { revision: "current" };
    if (options.method === "PUT") throw new Error("Save conflict");
    return {};
  };
  await assert.rejects(() => store.save(fixture, "current", [
    { path: "media/a.webp", base64: "YWJj" }, { path: "media/b.webp", base64: "YWJj" },
  ], event => events.push(event)), /Save conflict/);
  assert.deepEqual(events.filter(e => e.stage === "upload").map(e => e.completed), [0, 1, 2]);
  assert.ok(events.every(e => e.stage !== "done"));
  events.length = 0;
  await assert.rejects(() => store.save(fixture, "old", [], event => events.push(event)), /内容已更新/);
  assert.deepEqual(events.map(e => e.stage), ["save"]);
});


test("history, backup and unused-media reports are protected and preserve current and historical references", async t => {
  const {request,data,sqlite}=setup(t);
  for(const route of ["history","backup","media-report","health"])
    assert.equal((await request(`/api/admin/${route}`,{auth:false})).status,401);
  const loaded=await (await request('/api/admin/content')).json();
  data.site.email='second@example.com';
  await request('/api/admin/content',{method:'PUT',data,revision:loaded.revision});
  const history=await (await request('/api/admin/history')).json();
  assert.equal(history.entries.length,1);
  const older=await (await request(`/api/admin/history/${history.entries[0].sequence}`)).json();
  assert.equal(older.data.site.email,fixture.site.email);
  sqlite.prepare('INSERT INTO gallery_media(path,bytes) VALUES(?,?)').run('media/unused.webp',100);
  const report=await (await request('/api/admin/media-report')).json();
  assert.deepEqual(report.unused.map(p=>p.path),['media/unused.webp']);
  const backup=await (await request('/api/admin/backup')).json();
  assert.equal(backup.history.length,1);
  assert.equal(backup.data.site.email,'second@example.com');
  assert.equal(backup.media.length,contentImagePaths(data).size+1);
  assert.equal((await request('/api/admin/history/999')).status,404);
});

test("conditional public reads revalidate after another save and never retain hidden photographs", async t=>{
  const {request,data}=setup(t);
  const first=await request('/api/content',{auth:false});const etag=first.headers.get('ETag');
  assert.equal((await request('/api/content',{auth:false,headers:{'If-None-Match':etag}})).status,304);
  const current=await (await request('/api/admin/content')).json();
  data.photos.forEach(p=>p.published=false);
  await request('/api/admin/content',{method:'PUT',data,revision:current.revision});
  const next=await request('/api/content',{auth:false,headers:{'If-None-Match':etag}});
  assert.equal(next.status,200);assert.notEqual(next.headers.get('ETag'),etag);assert.deepEqual((await next.json()).photos,[]);
});

test("publication records partial failure, retries current content and never sends hidden works to GitHub", async t=>{
  const {DB,data,sqlite}=database(t), git=gitFixture();
  const template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8');
  const env={DB,SITE_ORIGIN:'https://mingyaophoto.com',GITHUB_REPO:'LMingyao/testWebRA1',GITHUB_BRANCH:'main',GITHUB_TOKEN:'fixture-only',MEDIA_BASE:'https://mingyaophoto.com/',ASSETS:{fetch:async()=>new Response(template)}};
  const worker=createWorker({fetcher:git.fetcher,authenticate:async()=> 'owner'});
  const request=()=>worker.fetch(new Request('https://studio.test/api/admin/publish',{method:'POST',headers:{Origin:'https://studio.test','X-Gallery-Request':'admin'}}),env);
  git.failNext(403);
  assert.equal((await (await request()).json()).status,'failed');
  assert.equal(sqlite.prepare('SELECT status FROM gallery_publication').get().status,'failed');
  assert.equal((await (await request()).json()).status,'submitted');
  const published=JSON.parse(git.files.get('content/gallery.json').bytes.toString());
  assert.deepEqual(published.photos.map(p=>p.id),['photo-one']);
  assert.match(git.files.get('index.html').bytes.toString(),/data-prerendered/);
  const commits=git.commits.size;await request();assert.equal(git.commits.size,commits);
  const current=sqlite.prepare('SELECT revision FROM gallery_content').get();
  data.site.email='third@example.com';data.photos[0].published=false;
  sqlite.prepare('UPDATE gallery_content SET document=?,revision=? WHERE revision=?').run(JSON.stringify(data),'updated',current.revision);
  assert.equal((await (await request()).json()).status,'submitted');
  assert.match(git.files.get('contact.html').bytes.toString(),/third@example.com/);
  assert.doesNotMatch(git.files.get('index.html').bytes.toString(),/alt="A plane in flight"/);
});

test("a photograph's three renditions use one commit, and replay after a lost response creates no extra commits",async t=>{
  const {DB}=database(t),git=gitFixture();
  const env={DB,GITHUB_TOKEN:'fixture-only',GITHUB_REPO:'LMingyao/testWebRA1',GITHUB_BRANCH:'main'};
  const worker=createWorker({fetcher:git.fetcher,authenticate:async()=> 'owner'});
  const bytes=Buffer.alloc(24);bytes.write('RIFF');bytes.write('WEBP',8);bytes.write('VP8 ',12);
  const uploads=[640,1280,1920].map(size=>({path:`media/photo-12345678-1234-1234-1234-123456789abc-${size}.webp`,base64:bytes.toString('base64')}));
  const request=()=>worker.fetch(new Request('https://studio.test/api/admin/media-batch',{method:'POST',headers:{Origin:'https://studio.test','X-Gallery-Request':'admin','Content-Type':'application/json'},body:JSON.stringify({uploads})}),env);
  assert.equal((await request()).status,200);assert.equal(git.commits.size,2);
  assert.equal((await request()).status,200);assert.equal(git.commits.size,2);
  const item=uploads[0];item.base64=Buffer.concat([bytes,Buffer.from('different')]).toString('base64');
  assert.equal((await request()).status,409);
});

test('service status distinguishes a submitted commit from a deployed revision and scans Git-only media',async t=>{
  const {DB,sqlite}=database(t),git=gitFixture();
  const revision=sqlite.prepare('SELECT revision FROM gallery_content').get().revision;
  sqlite.prepare('INSERT INTO gallery_publication(id,revision,status,message) VALUES(1,?,?,?)').run(revision,'submitted','Waiting');
  const orphan='media/photo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-640.webp';
  git.files.set(orphan,{bytes:Buffer.from('orphan'),sha:'fixture'});
  const env={DB,GITHUB_TOKEN:'fixture-only',GITHUB_REPO:'LMingyao/testWebRA1',GITHUB_BRANCH:'main',SITE_ORIGIN:'https://site.test',MEDIA_BASE:'https://media.test/'};
  let liveRevision='old';
  const fetcher=(url,options)=> new URL(url).hostname==='api.github.com' ? git.fetcher(url,options)
    : Promise.resolve(new URL(url).pathname.endsWith('publication.json') ? Response.json({revision:liveRevision}) : new Response(null));
  assert.equal((await health(env,fetcher)).publication.status,'submitted');
  liveRevision=revision;
  const state=await health(env,fetcher);assert.equal(state.publication.status,'published');assert.equal(state.mediaPreview.ok,true);
  const report=await mediaReport(env,fetcher);assert.equal(report.repositoryChecked,true);
  assert.ok(report.unused.some(file=>file.path===orphan&&file.unregistered));
});

test('publication refuses an expired lease before advancing the branch',async t=>{
  const {DB,sqlite}=database(t),git=gitFixture(), template=await readFile(new URL('../tools/page.html',import.meta.url),'utf8');
  const env={DB,GITHUB_TOKEN:'fixture-only',GITHUB_REPO:'LMingyao/testWebRA1',GITHUB_BRANCH:'main',ASSETS:{fetch:async()=>new Response(template)}};
  const before=git.commits.size;
  const fetcher=async(url,options)=>{if(options.method==='POST'&&new URL(url).pathname.endsWith('/git/commits')) sqlite.prepare('UPDATE gallery_publish_lock SET expires_at=0').run();return git.fetcher(url,options);};
  const result=await publish(env,fetcher);
  assert.equal(result.status,'pending');assert.equal(git.files.size,0);
  assert.equal(sqlite.prepare('SELECT status FROM gallery_publication').get().status,'pending');
  assert.ok(git.commits.size>before); // An unreachable commit is safe; the public branch is unchanged.
});

test('malformed media batches fail before any repository or database mutation',async t=>{
  const {DB,sqlite}=database(t),before=sqlite.prepare('SELECT count(*) AS n FROM gallery_media').get().n;
  for(const payload of [null,{uploads:[null]},{uploads:[{path:7}]},{uploads:[]}]) {
    const request=new Request('https://studio.test/api/admin/media-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    await assert.rejects(()=>registerMediaBatch(request,{DB},()=>{throw new Error('Must not access GitHub');}),error=>error.status===400);
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM gallery_media').get().n,before);
});
