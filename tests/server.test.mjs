import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createServer } from "../tools/server.mjs";
import { fixture as original } from "./fixture.mjs";
test("local admin persists edits, rejects stale saves and protects filesystem", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "photo-admin-"));
  const data = structuredClone(original);
  data.photos = [data.photos[0]];
  delete data.photos[0].thumbnail;
  delete data.photos[0].display;
  delete data.photos[0].large;
  await mkdir(path.join(root, "content"));
  await mkdir(path.join(root, "assets"));
  await writeFile(
    path.join(root, "content/gallery.json"),
    JSON.stringify(data),
  );
  const backend = { apiBase: "https://studio.example.com", adminURL: "https://studio.example.com/admin/" };
  await writeFile(path.join(root, "content/backend.json"), JSON.stringify(backend));
  await writeFile(path.join(root, data.photos[0].image), "fixture");
  await writeFile(path.join(root, data.site.aboutImage), "fixture");
  // Even a leftover legacy file should not be served by the local preview.
  await writeFile(path.join(root, "indexFR.html"), "retired");
  await writeFile(path.join(root, "BW.html"), "retired");
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(url + "/content/backend.json")).json(), { ...backend, apiBase: "" });
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "content/backend.json"), "utf8")), backend);
    const session = await (await fetch(url + "/api/session")).json();
    const loaded = await (await fetch(url + "/api/content")).json();
    data.site.name = "Saved photographer";
    const payload = { data, revision: loaded.revision, uploads: [] };
    assert.equal(
      (
        await fetch(url + "/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(url + "/api/content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": session.token,
            Origin: "https://attacker.invalid",
          },
          body: JSON.stringify(payload),
        })
      ).status,
      403,
    );
    const save = await fetch(url + "/api/content", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": session.token,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(save.status, 200);
    assert.equal(
      JSON.parse(
        await readFile(path.join(root, "content/gallery.json"), "utf8"),
      ).site.name,
      "Saved photographer",
    );
    assert.equal(
      (
        await fetch(url + "/api/content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": session.token,
          },
          body: JSON.stringify(payload),
        })
      ).status,
      409,
    );
    assert.equal((await fetch(url + "/.git/config")).status, 404);
    assert.equal((await fetch(url + "/tools/server.mjs")).status, 404);
    assert.equal((await fetch(url + "/indexFR.html")).status, 404);
    assert.equal((await fetch(url + "/BW.html")).status, 404);
    const newer = await (await fetch(url + "/api/content")).json();
    const bad = {
      data,
      revision: newer.revision,
      uploads: [
        {
          path: "media/a.webp",
          base64: Buffer.from("not an image").toString("base64"),
        },
      ],
    };
    assert.equal(
      (
        await fetch(url + "/api/content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": session.token,
          },
          body: JSON.stringify(bad),
        })
      ).status,
      400,
    );
    const hostStatus = await new Promise((resolve, reject) => {
      const req = http.request(
        url + "/api/session",
        { headers: { Host: "evil.invalid" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(hostStatus, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
