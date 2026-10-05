import http from "node:http";
import { readFile, writeFile, mkdir, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { validateContent, safeImage, contentImagePaths } from "../app/shared.js";

const revision = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 30 * 1024 * 1024) throw new Error("Request exceeds 30 MB.");
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
function validUpload(upload) {
  if (
    !safeImage(upload.path) ||
    !upload.path.startsWith("media/") ||
    typeof upload.base64 !== "string"
  )
    throw new Error("Invalid upload path.");
  const buffer = Buffer.from(upload.base64, "base64");
  const webp =
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP";
  if (
    !upload.path.endsWith(".webp") ||
    !webp ||
    buffer.length > 8 * 1024 * 1024 ||
    buffer.length < 16
  )
    throw new Error("Upload must be a WebP image under 8 MB.");
  return buffer;
}
export function createServer(root) {
  const secret = randomBytes(32).toString("hex");
  let saving = false;
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const host = req.headers.host;
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) {
      json(res, 403, { error: "Local requests only." });
      return;
    }
    const origin = `http://${host}`;
    if (req.headers.origin && req.headers.origin !== origin) {
      json(res, 403, { error: "Cross-origin requests are not allowed." });
      return;
    }
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === "/api/session" && req.method === "GET") {
        json(res, 200, { mode: "local", token: secret });
        return;
      }
      if (url.pathname === "/api/content" && req.method === "GET") {
        const buffer = await readFile(path.join(root, "content/gallery.json"));
        json(res, 200, {
          data: JSON.parse(buffer),
          revision: revision(buffer),
        });
        return;
      }
      if (url.pathname === "/api/content" && req.method === "PUT") {
        if (req.headers["x-admin-token"] !== secret) {
          json(res, 401, { error: "Reconnect to the local editor." });
          return;
        }
        if (saving) {
          json(res, 409, { error: "Another save is in progress." });
          return;
        }
        saving = true;
        try {
          const payload = await body(req);
          validateContent(payload.data);
          const target = path.join(root, "content/gallery.json");
          if (payload.revision !== revision(await readFile(target))) {
            json(res, 409, {
              error:
                "Content changed since you opened it. Export your draft, then reload.",
            });
            return;
          }
          const uploads = payload.uploads || [];
          if (!Array.isArray(uploads) || uploads.length > 150)
            throw new Error("Too many uploads.");
          const incoming = new Map(
            uploads.map((u) => [u.path, validUpload(u)]),
          );
          for (const file of contentImagePaths(payload.data))
            if (!incoming.has(file)) await readFile(path.join(root, file));
          for (const [file, buffer] of incoming) {
            const dest = path.join(root, file);
            try {
              await readFile(dest);
              throw new Error("An upload would overwrite an existing image.");
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, buffer, { flag: "wx" });
          }
          const next = JSON.stringify(payload.data, null, 2) + "\n";
          await writeFile(target + ".tmp", next);
          await rename(target + ".tmp", target);
          json(res, 200, { revision: revision(next) });
        } finally {
          saving = false;
        }
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        json(res, 404, { error: "Unknown endpoint." });
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        json(res, 405, { error: "Method not allowed." });
        return;
      }
      let requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      if (!requested) requested = "index.html";
      if (requested === "admin" || requested === "admin/")
        requested = "admin/index.html";
      if (
        requested.includes("..") ||
        requested.includes("\\") ||
        !(
          /^(index|ptr|about_me|contact|aviation|landscape|wildlife|motorsport)\.html$/.test(requested) ||
          /^(robots\.txt|sitemap\.xml)$/.test(requested) ||
          /^(app|admin|assets|media|content)\/[a-zA-Z0-9_./-]+$/.test(requested)
        )
      ) {
        json(res, 404, { error: "Not found." });
        return;
      }
      const resolved = await realpath(path.join(root, requested));
      if (!resolved.startsWith(path.resolve(root) + path.sep)) {
        json(res, 403, { error: "Not allowed." });
        return;
      }
      let buffer = await readFile(resolved);
      if (requested === "content/backend.json") {
        // The loopback editor saves local files. Keep its website preview on the
        // same local content even when the published Pages site uses D1.
        const config = JSON.parse(buffer);
        buffer = Buffer.from(JSON.stringify({ ...config, apiBase: "" }));
      }
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(requested)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : buffer);
    } catch (error) {
      json(res, error.code === "ENOENT" ? 404 : 400, {
        error: error.code === "ENOENT" ? "File not found." : error.message,
      });
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const server = createServer(root);
  server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(
      `Website: http://127.0.0.1:${server.address().port}\nEditor:  http://127.0.0.1:${server.address().port}/admin/`,
    ),
  );
}
