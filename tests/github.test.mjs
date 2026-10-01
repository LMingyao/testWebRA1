import test from "node:test";
import assert from "node:assert/strict";
import { GitHubStore } from "../admin/store.js";
import { fixture as data } from "./fixture.mjs";
test("GitHub save creates a commit and advances branch without forcing", async () => {
  const store = new GitHubStore(
    "fixture-token",
    "LMingyao/testWebRA1",
    "review",
  );
  const requests = [];
  store.request = async (endpoint, method = "GET", body) => {
    requests.push({ endpoint, method, body });
    if (endpoint === "git/ref/heads/review") return { object: { sha: "head" } };
    if (endpoint === "git/commits/head") return { tree: { sha: "tree" } };
    if (endpoint === "git/trees/tree?recursive=1")
      return {
        tree: [
          { path: "content/gallery.json", sha: "old", type: "blob" },
          ...[
            ...new Set([
              ...data.photos.flatMap((p) => [
                p.image,
                p.thumbnail,
                p.display,
                p.large,
              ]),
              data.site.aboutImage,
            ]),
          ]
            .filter(Boolean)
            .map((path) => ({ path, type: "blob" })),
        ],
      };
    if (endpoint === "git/blobs") return { sha: "new-content" };
    if (endpoint === "git/trees") return { sha: "new-tree" };
    if (endpoint === "git/commits") return { sha: "new-commit" };
    if (endpoint === "git/refs/heads/review") return {};
    throw new Error("Unexpected request");
  };
  const result = await store.save(data, "old", []);
  assert.equal(result.revision, "new-content");
  assert.deepEqual(requests.at(-1).body, { sha: "new-commit", force: false });
  assert.deepEqual(
    requests.find((r) => r.endpoint === "git/commits").body.parents,
    ["head"],
  );
  const before = requests.length;
  await assert.rejects(() => store.save(data, "stale", []), /其他编辑/);
  assert.equal(
    requests.slice(before).some((r) => r.method !== "GET"),
    false,
  );
});
