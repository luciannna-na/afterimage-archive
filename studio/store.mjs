import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@astrojs/markdown-remark";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const sections = ["journal", "notes", "culture", "photography"];
const publicDir = join(root, "public");
const contentDir = join(root, "src/content");
const mediaDir = join(root, ".archive-media");
const catalogPath = join(mediaDir, "catalog.json");
const homePath = join(root, "src/config/home.json");
export const mediaPrefix = "media/uploads/";
export const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
const filenamePattern = /^[a-z0-9][a-z0-9_-]{0,79}\.(jpg|png|webp|gif|avif)$/;
const optional = error => {
  if (error.code !== "ENOENT") throw error;
};
export function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function mime(name) {
  return types[name.split(".").pop()];
}
export async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), "." + randomUUID() + ".tmp");
  try {
    await writeFile(temp, value, { flag: "wx" });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
const json = value => JSON.stringify(value, null, 2) + "\n";
const revision = value => createHash("sha256").update(value).digest("hex");
const shortText = (value, max = 400) => {
  requireValue(value === undefined || typeof value === "string", "文字字段格式有误");
  const text = (value ?? "").trim();
  requireValue(text.length <= max, "文字字段超过长度限制");
  return text;
};
function entryPath(section, id) {
  requireValue(sections.includes(section), "栏目无效");
  requireValue(typeof id === "string" && /^[\p{L}\p{N}_-]{1,100}$/u.test(id), "内容编号无效");
  return join(contentDir, section, id + ".md");
}
export async function listEntries() {
  const groups = await Promise.all(sections.map(async section => {
    const files = await readdir(join(contentDir, section), { withFileTypes: true });
    return Promise.all(files.filter(file => file.isFile() && !file.name.startsWith(".") && file.name.endsWith(".md"))
      .map(file => readEntry(section, file.name.slice(0, -3))));
  }));
  return groups.flat().sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
}
export async function readEntry(section, id) {
  const source = await readFile(entryPath(section, id), "utf8").catch(optional);
  requireValue(source !== undefined, "找不到这条内容", 404);
  const { frontmatter, content } = parseFrontmatter(source.replace(/^\uFEFF/, ""));
  return { section, id, revision: revision(source), data: frontmatter, body: content.trim() };
}
export function uploadPath(name) {
  requireValue(typeof name === "string" && filenamePattern.test(name), "图片文件名无效", 404);
  return join(mediaDir, name);
}
export async function uploaded(name) {
  return readFile(uploadPath(name)).catch(optional);
}
async function photo(input) {
  if (!input) return undefined;
  const src = shortText(input.src);
  requireValue(/^media\/[a-z0-9_./-]+$/i.test(src) && !src.split("/").includes(".."), "请从素材库选择项目图片");
  const file = src.startsWith(mediaPrefix) ? uploadPath(src.slice(mediaPrefix.length)) : resolve(publicDir, src);
  requireValue((await stat(file).catch(optional))?.isFile(), "找不到图片 " + src);
  const alt = shortText(input.alt, 250);
  requireValue(alt, "请填写图片的替代文字");
  return { src, alt, caption: shortText(input.caption) };
}
export async function saveEntry(input) {
  const { section } = input;
  const isNew = !input.id;
  const id = input.id || randomUUID().slice(0, 12);
  const destination = entryPath(section, id);
  const old = isNew ? null : await readEntry(section, id);
  requireValue(isNew || input.revision === old.revision, "文件已发生变化，请重新打开后再保存", 409);
  const title = shortText(input.data?.title, 180);
  requireValue(title || section === "notes", "请输入标题");
  const date = shortText(input.data?.date, 10);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date, "请输入有效日期");
  const status = input.data?.status;
  requireValue(["draft", "published"].includes(status), "状态无效");
  const tags = input.data?.tags ?? [];
  requireValue(Array.isArray(tags) && tags.length <= 30, "标签最多 30 个");
  const photos = input.data?.photos ?? [];
  requireValue(Array.isArray(photos) && photos.length <= 60, "附图最多 60 张");
  const category = section === "culture" ? input.data?.category : undefined;
  requireValue(section !== "culture" || ["CINEMA", "MUSIC", "READING"].includes(category), "请填写文化分类");
  const body = shortText(input.body, 250000);
  const data = {
    ...old?.data,
    title: title || undefined,
    date, status,
    archive: old?.data.archive || section[0].toUpperCase() + "–" + id.slice(0, 6).toUpperCase(),
    tags: [...new Set(tags.map(tag => shortText(tag, 40)).filter(Boolean))],
    summary: shortText(input.data?.summary, 700),
    category,
    details: shortText(input.data?.details, 1000),
    cover: await photo(input.data?.cover),
    photos: (await Promise.all(photos.map(photo))).filter(Boolean),
  };
  const frontmatter = Object.entries(data).filter(([, value]) => value !== undefined)
    .map(([key, value]) => key + ": " + JSON.stringify(value)).join("\n");
  await atomicWrite(destination, "---\n" + frontmatter + "\n---\n\n" + body + "\n");
  return readEntry(section, id);
}
export async function deleteEntry({section, id, revision: expected, confirm}) {
  requireValue(confirm === id, "请确认要删除的内容");
  const current = await readEntry(section, id);
  requireValue(current.revision === expected, "文件已发生变化，请重新打开后再删除", 409);
  await rm(entryPath(section, id));
}
export async function homeLayout() {
  return JSON.parse(await readFile(homePath, "utf8"));
}
export async function saveHome(blocks) {
  requireValue(Array.isArray(blocks) && blocks.length === sections.length &&
    new Set(blocks.map(block => block.section)).size === sections.length, "首页区块无效");
  const entries = await listEntries();
  const result = blocks.map(({ section, ids, hidden }) => {
    requireValue(sections.includes(section), "首页栏目无效");
    requireValue(ids == null || (Array.isArray(ids) && ids.length <= 100 &&
      ids.every(id => entries.some(entry => entry.section === section && entry.id === id && entry.data.status === "published"))),
    "首页仅支持选择已发布的内容");
    return { section, ...(ids == null ? {} : { ids: [...new Set(ids)] }), hidden: hidden === true };
  });
  await atomicWrite(homePath, json(result));
  return result;
}
const catalog = async () => JSON.parse(await readFile(catalogPath, "utf8").catch(optional) || "{}");
export async function listMedia() {
  const [demo, files, metadata] = await Promise.all([
    readdir(join(publicDir, "media")),
    readdir(mediaDir).catch(optional),
    catalog()
  ]);
  return [
    ...demo.filter(name => filenamePattern.test(name)).map(name => ({ name, src: "media/" + name, demo: true })),
    ...(files ?? []).filter(name => filenamePattern.test(name)).sort().map(name => ({
      ...metadata[name], name, src: mediaPrefix + name
    })),
  ];
}
function detect(bytes) {
  if (bytes.length < 16) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.subarray(12, 16).toString() === "IHDR") return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "gif";
  if (bytes.toString("ascii", 4, 12) === "ftypavif" || bytes.toString("ascii", 4, 12) === "ftypavis") return "avif";
  return "";
}
function metadata(input) {
  return {
    alt: shortText(input.alt, 250),
    caption: shortText(input.caption),
    category: shortText(input.category, 80),
    source: shortText(input.source, 900),
  };
}
export async function saveMedia(bytes, original, replace) {
  requireValue(bytes.length <= 12 * 1024 * 1024, "单张图像不能超过 12 MB", 413);
  const ext = detect(bytes);
  requireValue(ext, "请选择受支持的 JPEG、PNG、WebP、GIF 或 AVIF 图片");
  if (replace) {
    requireValue(await uploaded(replace), "找不到待替换图片", 404);
    requireValue(replace.endsWith("." + ext), "替换图片必须与原文件格式相同");
  }
  const stem = original.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52);
  const name = replace || (stem || "image") + "-" + randomUUID().slice(0, 8) + "." + ext;
  await atomicWrite(uploadPath(name), bytes);
  const info = (await catalog())[name];
  return { ...info, name, src: mediaPrefix + name };
}
const references = entry => [
  entry.data.cover?.src,
  ...(entry.data.photos ?? []).map(photo => photo.src),
  ...Array.from(entry.body.matchAll(/media\/uploads\/[a-z0-9_-]+\.(?:jpg|png|webp|gif|avif)(?![\w.-])/g), match => match[0]),
].filter(Boolean);
async function isReferenced(name) {
  const src = mediaPrefix + name;
  return (await listEntries()).some(entry => references(entry).includes(src)) ||
    (await readFile(join(root, "src/config/site.ts"), "utf8")).includes(src);
}
export async function editMedia(input) {
  const file = uploadPath(input.name);
  requireValue((await stat(file).catch(optional))?.isFile(), "找不到图片", 404);
  const nextName = shortText(input.nextName, 90) || input.name;
  const next = uploadPath(nextName);
  const previous = await catalog();
  const updated = metadata(input);
  if (nextName !== input.name) {
    requireValue(mime(nextName) === mime(input.name), "文件扩展名必须保持一致");
    requireValue(!(await isReferenced(input.name)), "此图片正被内容使用；引用中的文件名保持稳定", 409);
    requireValue(!(await stat(next).catch(optional)), "此文件名已存在", 409);
    await rename(file, next);
  }
  delete previous[input.name];
  previous[nextName] = updated;
  try {
    await atomicWrite(catalogPath, json(previous));
  } catch (error) {
    if (nextName !== input.name) await rename(next, file);
    throw error;
  }
  return { ...updated, name: nextName, src: mediaPrefix + nextName };
}
export async function deleteMedia(name, confirm) {
  requireValue(confirm === name, "请确认要删除的图片");
  requireValue(!(await isReferenced(name)), "先移除文章或站点中的图片引用", 409);
  const file = uploadPath(name);
  const info = await catalog();
  await rm(file);
  if (name in info) {
    delete info[name];
    await atomicWrite(catalogPath, json(info));
  }
}
export async function publishedMedia() {
  const used = new Set((await listEntries()).filter(item => item.data.status === "published").flatMap(references));
  const site = await readFile(join(root, "src/config/site.ts"), "utf8");
  for (const match of site.matchAll(/["'](media\/uploads\/[a-z0-9_.-]+)["']/g)) used.add(match[1]);
  return [...used].filter(src => src.startsWith(mediaPrefix)).map(src => src.slice(mediaPrefix.length));
}
export async function publishMedia(output) {
  const destination = fileURLToPath(output);
  for (const name of await publishedMedia()) {
    const bytes = await uploaded(name);
    requireValue(bytes, "已发布内容引用了缺失图片 " + name);
    await atomicWrite(join(destination, mediaPrefix, name), bytes);
  }
}
export function guardedSource(path) {
  return /(?:^|\/)(?:\.archive-media|src\/(?:content|config\/home\.json))(?:\/|$)/i.test(path.replaceAll("\\", "/"));
}
