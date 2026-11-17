import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import {
  root, guardedSource, listEntries, readEntry, saveEntry, deleteEntry,
  homeLayout, saveHome, listMedia, saveMedia, editMedia, deleteMedia,
  uploaded, mime, publishedMedia, publishMedia, mediaPrefix, requireValue,
} from "./store.mjs";

const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const hostnames = new Set(["127.0.0.1", "[::1]", "localhost"]);
const uploadLimit = 12 * 1024 * 1024;
const localAsset = /^media\/[a-z0-9_./-]+$/i;
const mediaLink = src => typeof src === "string" && localAsset.test(src) && !src.split("/").includes("..");
const scripts = new Map([["editor.js", "text/javascript; charset=utf-8"], ["editor.css", "text/css; charset=utf-8"]]);

function reply(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
async function requestBody(req, limit) {
  requireValue(!req.headers["content-length"] || Number(req.headers["content-length"]) <= limit, "请求过大", 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      requireValue(false, "请求过大", 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  requireValue(req.headers["content-type"]?.split(";")[0] === "application/json", "需要 JSON 请求", 415);
  const raw = await requestBody(req, 2 * 1024 * 1024);
  let value;
  try { value = JSON.parse(raw.toString("utf8")); }
  catch { requireValue(false, "JSON 格式有误"); }
  requireValue(value && typeof value === "object", "请求内容无效");
  return value;
}
function normalizePath(url) {
  let pathname = url.pathname;
  for (let i = 0; i < 3; i++) {
    const decoded = decodeURIComponent(pathname);
    if (decoded === pathname) break;
    pathname = decoded;
  }
  return pathname;
}
function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
export function studioIntegration() {
  let base = "/";
  const token = randomUUID();
  let processor;
  let queue = Promise.resolve();
  const serial = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const serve = async (req, res, next) => {
    const address = new URL(req.url, "http://localhost");
    const pathname = normalizePath(address);
    if (guardedSource(pathname)) return reply(res, 404, { error: "找不到页面" });
    const relative = pathname.startsWith(base) ? pathname.slice(base.length) : null;
    if (relative?.startsWith(mediaPrefix)) {
      const name = relative.slice(mediaPrefix.length);
      if (!(await publishedMedia()).includes(name)) return reply(res, 404, { error: "找不到图片" });
      const bytes = await uploaded(name);
      return bytes ? reply(res, 200, bytes, mime(name)) : reply(res, 404, { error: "找不到图片" });
    }
    if (relative !== "studio" && !relative?.startsWith("studio/")) return next();

    const host = new URL("http://" + (req.headers.host ?? ""));
    requireValue(loopback.has(req.socket.remoteAddress) && hostnames.has(host.hostname), "编辑室仅限本机访问", 403);
    requireValue(!req.headers.origin || req.headers.origin === host.origin, "来源校验失败", 403);
    requireValue(req.headers["sec-fetch-site"] !== "cross-site", "来源校验失败", 403);
    const route = relative.slice("studio/".length);
    if (req.method === "GET" && relative === "studio") {
      res.writeHead(308, { Location: base + "studio/" });
      return res.end();
    }
    if (req.method === "GET" && scripts.has(route)) {
      return reply(res, 200, await readFile(join(root, "studio/ui", route)), scripts.get(route));
    }
    if (req.method === "GET" && route === "") {
      res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      return reply(res, 200, await readFile(join(root, "studio/ui/index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && route === "api/state") {
      const [entries, media, home] = await Promise.all([listEntries(), listMedia(), homeLayout()]);
      return reply(res, 200, { token, entries: entries.map(({section, id, data}) => ({section, id, data})), media, home });
    }
    requireValue(req.headers["x-studio-token"] === token || (req.method === "GET" && route === "api/image"), "编辑会话已过期，请刷新", 403);
    if (req.method === "GET" && route === "api/entry") {
      return reply(res, 200, await readEntry(address.searchParams.get("section"), address.searchParams.get("id")));
    }
    if (req.method === "GET" && route === "api/image") {
      requireValue(address.searchParams.get("key") === token, "图片预览已过期", 403);
      const name = address.searchParams.get("name");
      const bytes = await uploaded(name);
      requireValue(bytes, "找不到图片", 404);
      return reply(res, 200, bytes, mime(name));
    }
    if (req.method === "POST" && route === "api/preview") {
      const input = await jsonBody(req);
      requireValue(typeof input.body === "string" && input.body.length <= 250000, "预览正文无效");
      processor ??= createMarkdownProcessor({ syntaxHighlight: false });
      const { code } = await (await processor).render(input.body);
      const html = code.replace(/(<img\b[^>]*?\bsrc=")([^"]+)"/gi, (match, start, original) => {
        const src = original.replace(/^(?:\.\.\/)+|^\//, "");
        if (!mediaLink(src)) return start + '"';
        if (src.startsWith(mediaPrefix)) return start + base + "studio/api/image?name=" +
          escapeAttribute(encodeURIComponent(src.slice(mediaPrefix.length)) + "&key=" + token) + '"';
        return start + base + escapeAttribute(src) + '"';
      });
      return reply(res, 200, { html });
    }
    if (req.method === "POST" && route === "api/upload") {
      requireValue(req.headers["content-type"] === "application/octet-stream", "请选择本地图片", 415);
      const bytes = await requestBody(req, uploadLimit);
      return reply(res, 201, await serial(() => saveMedia(bytes, address.searchParams.get("name") ?? "image", address.searchParams.get("replace"))));
    }
    if (req.method === "POST" && route === "api/entry") {
      const value = await jsonBody(req);
      return reply(res, 200, await serial(() => saveEntry(value)));
    }
    if (req.method === "DELETE" && route === "api/entry") {
      const value = await jsonBody(req);
      await serial(() => deleteEntry(value));
      return reply(res, 200, { ok: true });
    }
    if (req.method === "PUT" && route === "api/media") {
      const value = await jsonBody(req);
      return reply(res, 200, await serial(() => editMedia(value)));
    }
    if (req.method === "DELETE" && route === "api/media") {
      const value = await jsonBody(req);
      await serial(() => deleteMedia(value.name, value.confirm));
      return reply(res, 200, { ok: true });
    }
    if (req.method === "PUT" && route === "api/home") {
      const value = await jsonBody(req);
      return reply(res, 200, await serial(() => saveHome(value)));
    }
    return reply(res, 404, { error: "找不到此编辑操作" });
  };
  return {
    name: "afterimage-studio",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        base = config.base.replace(/\/$/, "") + "/";
        if (command !== "dev") return;
        updateConfig({ vite: { plugins: [{
          name: "afterimage-local-api",
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              serve(req, res, next).catch(error => {
                if (res.headersSent) return res.end();
                if (!error.status) console.error("[Studio]", error);
                reply(res, error.status || 500, { error: error.status ? error.message : "操作失败，请检查本地服务日志" });
              });
            });
          },
        }] } });
      },
      "astro:build:done": ({ dir }) => publishMedia(dir),
    },
  };
}

export function archiveMarkdown(base = "/") {
  const prefix = base.replace(/\/$/, "") + "/";
  return function transformer() {
    return tree => {
      function visit(node) {
        if ((node.type === "image" || node.type === "definition") && mediaLink(node.url)) node.url = prefix + node.url;
        node.children?.forEach(visit);
      }
      visit(tree);
    };
  };
}
