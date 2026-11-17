const workspace = document.querySelector("#workspace");
const notice = document.querySelector("#notice");
const tabs = document.querySelector("#tabs");
const confirmation = document.querySelector("#confirm");
const preview = document.querySelector("#preview");
const labels = { journal: "日记", notes: "碎碎念", culture: "文化档案", photography: "摄影" };
const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const field = (name, label, value = "", type = "text") => `<label>${label}<input type="${type}" name="${name}" value="${escapeHtml(value)}"></label>`;
const button = (action, text, data = "", klass = "") =>
  `<button type="button" class="${klass}" data-action="${action}" data-value="${escapeHtml(data)}">${text}</button>`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let state;
let active = "journal";
let current = null;
let editingMedia = "";
let dirty = false;
let busy = false;
let layout;

function report(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle("error", error);
}
async function api(route, options = {}) {
  const response = await fetch("./api/" + route, {
    cache: "no-store",
    ...options,
    headers: { ...(state?.token ? { "X-Studio-Token": state.token } : {}), ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "本地请求失败");
  return result;
}
const send = (route, method, data) => api(route, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const stateUpdate = async () => { state = await api("state"); };
function imageURL(src) {
  if (!/^media\/[a-z0-9_./-]+$/i.test(src) || src.split("/").includes("..")) return "";
  if (!src.startsWith("media/uploads/")) return "../" + src;
  return "./api/image?" + new URLSearchParams({ name: src.slice(14), key: state.token });
}
const image = (src, alt = "") => src ? `<img src="${escapeHtml(imageURL(src))}" alt="${escapeHtml(alt)}" loading="lazy">` : "";
const statusName = status => status === "published" ? "已发布" : "草稿";
const titleOf = entry => entry.data.title || entry.data.summary || "无标题 · " + entry.data.date;
const categories = ["CINEMA", "MUSIC", "READING"];
function blank(section) {
  return { section, data: { date: today(), status: "draft", photos: [], tags: [], category: "CINEMA" }, body: "" };
}
function photoEditor(photo, type, index) {
  const { src, alt, caption } = photo ?? {};
  return `<fieldset class="photo-edit" data-photo="${type}">
    <legend>${type === "cover" ? "封面" : "附图 " + (index + 1)}</legend>
    <div class="thumbnail">${image(src, alt)}</div>
    <label>素材<select data-src><option value="">选择图片</option>
      ${state.media.map(media => `<option value="${escapeHtml(media.src)}" ${media.src === src ? "selected" : ""}>${escapeHtml(media.name)}</option>`).join("")}
      ${src && !state.media.some(media => media.src === src) ? `<option selected value="${escapeHtml(src)}">${escapeHtml(src)}</option>` : ""}
    </select></label>
    <label class="file">上传本地图片<input type="file" data-photo-upload accept="image/jpeg,image/png,image/webp,image/gif,image/avif"></label>
    ${field("alt", "替代文字", alt)}
    ${field("caption", "图片说明", caption)}
    ${type === "extra" ? `<div class="actions">
      ${button("move-photo", "上移", "-1")}${button("move-photo", "下移", "1")}
      ${button("insert", "插入正文")}${button("remove-photo", "移除附图")}
    </div>` : ""}
  </fieldset>`;
}
function entryPanel() {
  const data = current.data;
  return `<form class="panel" id="entry-form">
    <div class="panel-head"><h2>${current.id ? "编辑" : "新建"}${labels[active]}</h2><span>${statusName(data.status)}</span></div>
    <div class="fields">
      ${field("title", active === "notes" ? "标题（可空）" : "标题", data.title)}
      ${field("date", "日期", data.date, "date")}
      ${field("tags", "标签（用逗号分隔）", data.tags?.join(", "))}
      ${field("summary", "摘要", data.summary)}
      ${active === "culture" ? `<label>分类<select name="category">${categories.map(category =>
        `<option ${data.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></label>` : ""}
      ${active === "culture" || active === "photography" ? field("details", active === "culture" ? "档案资料 / 个人评价" : "器材 / 拍摄资料", data.details) : ""}
    </div>
    <label>正文（Markdown）<textarea name="body" rows="10" placeholder="写下今天的内容…">${escapeHtml(current.body)}</textarea></label>
    ${photoEditor(data.cover, "cover")}
    <div class="panel-head"><h3>附图</h3>${button("add-photo", "添加附图")}</div>
    <div id="photos">${(data.photos ?? []).map((photo, index) => photoEditor(photo, "extra", index)).join("")}</div>
    <label class="file">批量上传为附图<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple data-batch></label>
    <div class="actions sticky">
      ${button("preview", "预览")}
      ${button("save", "保存草稿", "draft")}
      ${button("save", data.status === "published" ? "更新发布" : "发布到本地", "published", "primary")}
      ${current.id ? button("delete-entry", "删除", "", "danger") : ""}
      ${current.id && data.status === "published" && active !== "notes" ?
        `<a href="../${active}/${encodeURIComponent(current.id)}/" target="_blank" rel="noopener">查看公开页 ↗</a>` : ""}
    </div>
  </form>`;
}
function mediaPanel() {
  const selected = state.media.find(item => item.name === editingMedia && !item.demo);
  return `<section class="panel">
    <div class="panel-head"><h2>媒体素材</h2><label class="file">上传本地图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple data-library></label></div>
    <p class="small">上传图片保存到项目素材库。仅被已发布内容引用的上传图片才进入站点输出。</p>
    ${selected ? `<form id="media-form" class="media-editor">
      ${image(selected.src, selected.alt)}
      <div class="fields">
        ${field("nextName", "文件名", selected.name)}
        ${field("alt", "替代文字", selected.alt)}
        ${field("caption", "图片说明", selected.caption)}
        ${field("category", "分类", selected.category)}
        ${field("source", "来源 / 作者 / 许可", selected.source)}
      </div>
      <div class="actions">
        <label class="file">替换图片（同格式）<input type="file" data-replace accept="image/jpeg,image/png,image/webp,image/gif,image/avif"></label>
        ${button("media-save", "保存资料", "", "primary")}${button("media-delete", "删除素材", "", "danger")}
      </div>
    </form>` : ""}
    <div class="media-grid">${state.media.map(item => `<figure>${image(item.src, item.alt)}<figcaption>${escapeHtml(item.name)}
      ${item.demo ? "<span>演示素材</span>" : button("media-edit", "管理", item.name)}
    </figcaption></figure>`).join("")}</div>
  </section>`;
}
function homePanel() {
  return `<section class="panel"><h2>首页编排</h2><p class="small">区块可隐藏。自选以从上至下的顺序呈现，可在已选清单内再次调整。</p>
    <div id="layout">${layout.map((block, index) => {
      const choices = state.entries.filter(entry => entry.section === block.section && entry.data.status === "published");
      const selected = (block.ids ?? []).map(id => choices.find(item => item.id === id)).filter(Boolean);
      return `<fieldset class="home-block" data-section="${block.section}">
        <legend>${index + 1}. ${labels[block.section]}</legend>
        <div class="actions">${button("move-block", "上移区块", "-1")}${button("move-block", "下移区块", "1")}</div>
        <label class="check"><input type="checkbox" data-hide ${block.hidden ? "checked" : ""}> 隐藏此区块</label>
        <label>选择模式<select data-mode><option value="auto">自动显示最新</option><option value="manual" ${block.ids ? "selected" : ""}>手动选择</option></select></label>
        ${block.ids ? `<div class="choice-list">
          ${choices.map(item => `<label class="check"><input type="checkbox" data-select-entry="${escapeHtml(item.id)}" ${block.ids.includes(item.id) ? "checked" : ""}> ${escapeHtml(titleOf(item))}</label>`).join("")}
        </div><ol>${selected.map(item => `<li>${escapeHtml(titleOf(item))} ${button("move-choice", "上移", item.id + "|-1")} ${button("move-choice", "下移", item.id + "|1")}</li>`).join("")}</ol>` : ""}
      </fieldset>`;
    }).join("")}</div>
    <div class="actions">${button("home-save", "保存首页编排", "", "primary")}<a href="../" target="_blank" rel="noopener">查看首页 ↗</a></div>
  </section>`;
}
function draw() {
  for (const tab of tabs.querySelectorAll("button")) tab.setAttribute("aria-pressed", String(tab.dataset.tab === active));
  if (active === "media") workspace.innerHTML = mediaPanel();
  else if (active === "home") workspace.innerHTML = homePanel();
  else {
    const entries = state.entries.filter(entry => entry.section === active);
    workspace.innerHTML = `<div class="work-grid"><aside class="panel"><div class="panel-head"><h2>${labels[active]}</h2>${button("new", "＋ 新建", "", "primary")}</div>
      <ul class="entries">${entries.map(entry => `<li><button type="button" data-action="open" data-value="${escapeHtml(entry.id)}" aria-current="${current?.id === entry.id}">
        <strong>${escapeHtml(titleOf(entry))}</strong><span>${escapeHtml(entry.data.date)} · ${statusName(entry.data.status)}</span></button></li>`).join("")}</ul></aside>
      ${current ? entryPanel() : '<p class="blank">从左侧打开已有内容，或新建一条记录。</p>'}</div>`;
  }
  workspace.setAttribute("aria-busy", "false");
}
function readPhoto(row) {
  return { src: row.querySelector("[data-src]").value, alt: row.querySelector('[name="alt"]').value,
    caption: row.querySelector('[name="caption"]').value };
}
function readEntryForm(status) {
  const form = workspace.querySelector("#entry-form");
  const values = new FormData(form);
  return { ...current, data: { ...current.data,
    title: values.get("title"), date: values.get("date"), summary: values.get("summary"),
    tags: values.get("tags").split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
    category: values.get("category") ?? undefined, details: values.get("details") ?? undefined,
    status: status ?? current.data.status,
    cover: readPhoto(form.querySelector('[data-photo="cover"]')),
    photos: [...form.querySelectorAll('[data-photo="extra"]')].map(readPhoto),
  }, body: values.get("body") };
}
function withoutEmptyPhotos(entry) {
  return { ...entry, data: { ...entry.data, cover: entry.data.cover.src ? entry.data.cover : undefined,
    photos: entry.data.photos.filter(photo => photo.src) } };
}
function keepPhotoInputs() {
  current = readEntryForm();
}
function reorder(list, index, delta) {
  const next = index + delta;
  if (index < 0 || next < 0 || next >= list.length) return;
  [list[index], list[next]] = [list[next], list[index]];
}
const canLeave = () => !dirty || window.confirm("当前有未保存的修改，确定离开？");
function localConfirm(label) {
  const input = confirmation.querySelector("input");
  const submit = confirmation.querySelector(".danger");
  confirmation.querySelector("p").textContent = "将从项目文件中永久删除「" + label + "」。";
  input.value = "";
  submit.disabled = true;
  input.oninput = () => { submit.disabled = input.value !== "删除"; };
  confirmation.returnValue = "";
  confirmation.showModal();
  input.focus();
  return new Promise(resolve => confirmation.addEventListener("close", () => resolve(
    confirmation.returnValue === "delete" && input.value === "删除"), { once: true }));
}
async function upload(file, replace) {
  const query = new URLSearchParams({ name: file.name });
  if (replace) query.set("replace", replace);
  const item = await api("upload?" + query, { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } });
  const index = state.media.findIndex(media => media.src === item.src);
  if (index < 0) state.media.push(item);
  else state.media[index] = item;
  return item;
}
const hydrate = item => ({ src: item.src, alt: item.alt || (item.name.replace(/\.[^.]+$/, "").replaceAll("-", " ")), caption: item.caption || "" });
async function previewEntry() {
  const entry = withoutEmptyPhotos(readEntryForm());
  const { html } = await send("preview", "POST", { body: entry.body });
  const figure = photo => photo ? `<figure>${image(photo.src, photo.alt)}<figcaption>${escapeHtml(photo.caption)}</figcaption></figure>` : "";
  preview.querySelector("iframe").srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; form-action 'none'">
    <link rel="stylesheet" href="./editor.css"></head><body class="preview-page"><main>
    <p class="small">${escapeHtml(entry.data.date)} / ${statusName(entry.data.status)}</p><h1>${escapeHtml(entry.data.title || "无标题")}</h1>
    <p>${escapeHtml(entry.data.summary)}</p>${figure(entry.data.cover)}<article>${html}</article>${entry.data.photos.map(figure).join("")}</main></body></html>`;
  preview.showModal();
}
async function action(control) {
  const { action, value } = control.dataset;
  if (action === "new" || action === "open") {
    if (!canLeave()) return;
    current = action === "new" ? blank(active) : await api("entry?" + new URLSearchParams({ section: active, id: value }));
    dirty = false;
    draw();
    workspace.querySelector('input[name="title"]').focus();
  } else if (action === "save") {
    const entry = withoutEmptyPhotos(readEntryForm(value));
    current = await send("entry", "POST", entry);
    dirty = false;
    await stateUpdate();
    draw();
    report(value === "draft" ? "草稿已写入 Markdown 文件。" : "已发布到本地站点。");
  } else if (action === "preview") {
    await previewEntry();
  } else if (action === "delete-entry" && await localConfirm(titleOf(current))) {
    await send("entry", "DELETE", { ...current, confirm: current.id });
    current = null;
    dirty = false;
    await stateUpdate();
    draw();
    report("已删除 Markdown 文件。");
  } else if (["add-photo", "remove-photo", "move-photo"].includes(action)) {
    const rows = [...workspace.querySelectorAll('[data-photo="extra"]')];
    const index = rows.indexOf(control.closest("fieldset"));
    keepPhotoInputs();
    if (action === "add-photo") current.data.photos.push({});
    else if (action === "remove-photo") current.data.photos.splice(index, 1);
    else reorder(current.data.photos, index, Number(value));
    dirty = true;
    draw();
  } else if (action === "insert") {
    const photo = readPhoto(control.closest("fieldset"));
    if (!photo.src) throw new Error("请先选择要插入的图片");
    const body = workspace.querySelector('[name="body"]');
    const alt = photo.alt.replaceAll("[", "").replaceAll("]", "");
    body.setRangeText("\n\n![" + alt + "](" + photo.src + ")\n" +
      (photo.caption ? "\n*" + photo.caption.replace(/[\r\n*]/g, "") + "*\n" : ""), body.selectionStart, body.selectionEnd, "end");
    body.focus();
    dirty = true;
  } else if (action === "media-edit") {
    if (!canLeave()) return;
    editingMedia = value;
    dirty = false;
    draw();
    workspace.querySelector("#media-form").scrollIntoView({ block: "nearest" });
  } else if (action === "media-save") {
    const info = Object.fromEntries(new FormData(workspace.querySelector("#media-form")));
    const saved = await send("media", "PUT", { ...info, name: editingMedia });
    editingMedia = saved.name;
    dirty = false;
    await stateUpdate();
    draw();
    report("素材资料已保存。");
  } else if (action === "media-delete" && await localConfirm(editingMedia)) {
    await send("media", "DELETE", { name: editingMedia, confirm: editingMedia });
    editingMedia = "";
    dirty = false;
    await stateUpdate();
    draw();
    report("素材文件已删除。");
  } else if (action === "move-block" || action === "move-choice") {
    const block = layout.find(item => item.section === control.closest("fieldset").dataset.section);
    if (action === "move-block") reorder(layout, layout.indexOf(block), Number(value));
    else {
      const [id, delta] = value.split("|");
      reorder(block.ids, block.ids.indexOf(id), Number(delta));
    }
    dirty = true;
    draw();
  } else if (action === "home-save") {
    layout = await send("home", "PUT", layout);
    state.home = structuredClone(layout);
    dirty = false;
    report("首页顺序与精选已写入配置文件。");
  }
}
async function run(operation) {
  if (busy) return;
  busy = true;
  workspace.classList.add("busy");
  try { await operation(); }
  catch (error) { report(error.message, true); }
  finally { busy = false; workspace.classList.remove("busy"); }
}
tabs.addEventListener("click", event => {
  const tab = event.target.closest("[data-tab]");
  if (!tab || busy || !state || tab.dataset.tab === active || !canLeave()) return;
  active = tab.dataset.tab;
  current = null;
  dirty = false;
  layout = structuredClone(state.home);
  draw();
});
workspace.addEventListener("click", event => {
  const control = event.target.closest("[data-action]");
  if (control) run(() => action(control));
});
workspace.addEventListener("submit", event => event.preventDefault());
workspace.addEventListener("input", event => {
  if (event.target.type !== "file") dirty = true;
});
workspace.addEventListener("change", event => {
  const input = event.target;
  if (active === "home") {
    const block = layout.find(item => item.section === input.closest("fieldset")?.dataset.section);
    if (!block) return;
    if (input.matches("[data-hide]")) block.hidden = input.checked;
    if (input.matches("[data-mode]")) {
      if (input.value === "manual") block.ids = [];
      else delete block.ids;
    }
    if (input.matches("[data-select-entry]")) {
      const id = input.dataset.selectEntry;
      block.ids = input.checked ? [...block.ids, id] : block.ids.filter(item => item !== id);
    }
    dirty = true;
    draw();
    return;
  }
  if (input.matches("[data-src]")) {
    const row = input.closest("fieldset");
    const selected = state.media.find(item => item.src === input.value);
    row.querySelector(".thumbnail").innerHTML = image(input.value, selected?.alt);
    row.querySelector('[name="alt"]').value = selected ? hydrate(selected).alt : "";
    row.querySelector('[name="caption"]').value = selected?.caption ?? "";
  }
  if (!input.files?.length) return;
  run(async () => {
    const files = [...input.files];
    if (input.matches("[data-replace]")) {
      if (dirty && !canLeave()) return;
      await upload(files[0], editingMedia);
      dirty = false;
      draw();
      report("图片文件已替换，原有引用继续有效。");
      return;
    }
    if (input.matches("[data-library]")) {
      for (const file of files) {
        const item = await upload(file);
        if (!dirty) editingMedia = item.name;
      }
      draw();
      report("图片已写入项目素材库。");
      return;
    }
    keepPhotoInputs();
    if (input.matches("[data-batch]")) {
      for (const file of files) current.data.photos.push(hydrate(await upload(file)));
    } else {
      const row = input.closest("fieldset");
      const item = hydrate(await upload(files[0]));
      if (row.dataset.photo === "cover") current.data.cover = item;
      else current.data.photos[[...workspace.querySelectorAll('[data-photo="extra"]')].indexOf(row)] = item;
    }
    dirty = true;
    draw();
    report("图片已写入项目。请保存文章以保留引用。");
  });
});
window.addEventListener("beforeunload", event => {
  if (dirty) { event.preventDefault(); event.returnValue = ""; }
});
try {
  await stateUpdate();
  layout = structuredClone(state.home);
  draw();
  report("已读取本地项目文件。");
} catch (error) { report(error.message, true); }
