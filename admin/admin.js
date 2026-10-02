import {
  escapeHTML as e,
  validateContent,
  movePhotoWithinPlacement,
  contentImagePaths,
} from "../app/shared.js";
import { getLocalStore, GitHubStore } from "./store.js";
import { getD1Store } from "./d1-store.js";
import { backendConfig } from "../app/backend.js";
import { preparePhoto } from "./images.js";
import { bindPhotoOrdering } from "./ordering.js";
import { previewContent } from "./preview-data.js";
import { collections, defaultCollection, editableCollections, gearItems } from "../app/config.js";
import { applySiteChrome } from "../app/chrome.js";
import { renderCollectionEditor, renderSiteEditor, syncSiteForm, collectionTarget, moveCollection, setCollectionVisible, configurationError } from "./config-editor.js";
let store,
  data,
  revision,
  base,
  view = "photos",
  search = "",
  filter = "all",
  placementFilter = "all",
  editing,
  busy = false;
let uploads = [],
  previews = new Map();
const $ = (selector) => document.querySelector(selector);
function notice(message, error = false) {
  $("#notification").textContent = error ? configurationError(message) : message;
  $("#notification").classList.toggle("error", error);
}
function isDirty() {
  return data && JSON.stringify(data) !== base;
}
function dirty() {
  const changed = isDirty();
  $("#dirty-state").textContent = changed ? "有未保存的更改" : "已保存";
  $("#save").disabled = !changed || busy;
  schedulePreview();
}
function image(photo) {
  return previews.get(photo.id) || store.image(photo.thumbnail || photo.image);
}
function categoryName(id) {
  return data.categories.find((c) => c.id === id)?.label || id;
}
function card(photo, boundaries) {
  const { first, last } = boundaries.get(photo.placement || "gallery");
  const categoryVisible = data.categories.find(category => category.id === photo.category)?.visible !== false;
  return `<article class="admin-card" data-card="${e(photo.id)}"><button data-edit="${e(photo.id)}" aria-label="编辑 ${e(photo.title)}"><img src="${e(image(photo))}" alt="${e(photo.alt)}" loading="lazy"></button><div class="card-info"><div class="card-title">${e(photo.title)} ${photo.homeSelected ? " · 精选集合" : ""}${photo.featured ? " · 轮播首图" : ""}</div><div class="card-meta"><span>${e(categoryName(photo.category))} · ${photo.placement === "hero" ? "顶部轮播" : "作品画廊"}</span><span class="badge ${photo.published && categoryVisible ? "" : "draft"}">${!photo.published ? "已隐藏" : categoryVisible ? "展示中" : "分类已隐藏"}</span></div></div><div class="card-actions"><button class="drag-handle" data-drag="${e(photo.id)}" aria-label="拖动排序 ${e(photo.title)}" title="拖动排序">⠿</button><button data-move="${e(photo.id)}" data-direction="-1" aria-label="向前移动 ${e(photo.title)}" ${photo.id === first ? "disabled" : ""}>↑</button><button data-move="${e(photo.id)}" data-direction="1" aria-label="向后移动 ${e(photo.title)}" ${photo.id === last ? "disabled" : ""}>↓</button><button data-toggle="${e(photo.id)}">${photo.published ? "隐藏" : "展示"}</button><button data-edit="${e(photo.id)}">编辑</button></div></article>`;
}
function renderCards() {
  const boundaries = new Map();
  for (const photo of data.photos) {
    const placement = photo.placement || "gallery";
    if (!boundaries.has(placement)) boundaries.set(placement, { first: photo.id });
    boundaries.get(placement).last = photo.id;
  }
  const query = search.toLowerCase();
  const photos = data.photos.filter(
    (p) =>
      (filter === "all" || p.category === filter) &&
      matchesArea(p, placementFilter) &&
      `${p.title} ${p.alt}`.toLowerCase().includes(query),
  );
  $("#photo-list").innerHTML = photos.length
    ? photos.map((photo) => card(photo, boundaries)).join("")
    : '<p class="empty">暂无匹配照片。</p>';
}
function matchesArea(photo, area) {
  return area === "all" || (area === "selected"
    ? photo.homeSelected === true : (photo.placement || "gallery") === area);
}
function renderPhotos() {
  $("#editor").innerHTML =
    `<div class="stats"><div class="stat"><span>照片总数</span><strong>${data.photos.length}</strong></div><div class="stat"><span>正在展示</span><strong>${data.photos.filter((p) => p.published && data.categories.some(category => category.id === p.category && category.visible !== false)).length}</strong></div><div class="stat"><span>作品分类</span><strong>${data.categories.length}</strong></div></div><div class="library-tools"><input id="search" type="search" placeholder="搜索照片…" aria-label="搜索照片" value="${e(search)}"><select id="category-filter" aria-label="按分类筛选"><option value="all">全部分类</option>${data.categories.map((c) => `<option value="${e(c.id)}" ${filter === c.id ? "selected" : ""}>${e(c.label)}</option>`).join("")}</select><button class="primary" id="upload" ${data.categories.length ? "" : "disabled"}>＋ 上传照片</button></div><div class="admin-grid" id="photo-list"></div><p class="hint import-note">精选集合只显示已勾选“加入精选集合”的展示照片，题材分类页显示该分类全部展示照片。轮播照片不会出现在下方图库。上传后默认隐藏且不加入精选集合，拖动手柄或 ↑ ↓ 调整所在区域的顺序；打开“作品预览”即可比较桌面与手机效果。</p>`;
  $(".stats").insertAdjacentHTML(
    "afterend",
    `<div class="library-areas">${[
        { id: "all", label: "全部照片" },
        { id: "selected", label: "精选集合" },
        { id: "gallery", label: "作品画廊" },
        { id: "hero", label: "顶部轮播" },
      ].map((area) =>
        `<button data-placement-filter="${area.id}" aria-pressed="${placementFilter === area.id}">${area.label} <small>${data.photos.filter((photo) => matchesArea(photo, area.id)).length}</small></button>`,
      ).join("")}</div>`,
  );
  renderCards();
}
function renderCategories() {
  $("#editor").innerHTML = renderCollectionEditor(data);
}
function renderSettings() {
  $("#editor").innerHTML = renderSiteEditor(data, path => previews.get(path) || previews.get(data.photos.find(photo => photo.image === path)?.id) || store.image(path));
}
function render() {
  if (!data) return;
  applySiteChrome(data);
  $("#view-title").textContent = {
    photos: "照片库",
    categories: "分类管理",
    settings: "网站内容",
  }[view];
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.removeAttribute("aria-current");
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
  });
  ({
    photos: renderPhotos,
    categories: renderCategories,
    settings: renderSettings,
  })[view]();
  dirty();
}
async function connect(adapter) {
  const loaded = await adapter.load();
  data = validateContent(loaded.data);
  revision = loaded.revision;
  base = JSON.stringify(data);
  store = adapter;
  $("#connection").textContent =
    store.mode === "local"
      ? "● 本机管理 · 更改保存到项目文件"
      : store.mode === "d1" ? `● D1 云后台 · ${store.email}` : `● GitHub · ${store.branch}`;
  $("#disconnect").hidden = store.mode === "local";
  $("#save").textContent =
    store.mode === "github" ? `发布到 ${store.branch}` : "保存更改";
  $("#disconnect").textContent = store.mode === "d1" ? "退出登录" : "断开连接";
  $("#export").disabled = false;
  $("#preview-toggle").disabled = false;
  render();
  if (store.mode === "d1" && !store.canUpload)
    notice("已连接 D1。照片上传尚未配置，已有照片、分类和网站内容可以管理。");
}
function editPhoto(id) {
  editing = id;
  const p = data.photos.find((p) => p.id === id);
  const form = $("#photo-form");
  form.elements.title.value = p.title;
  form.elements.alt.value = p.alt;
  form.elements.category.innerHTML = data.categories
    .map((c) => `<option value="${e(c.id)}">${e(c.label)}</option>`)
    .join("");
  form.elements.category.value = p.category;
  form.elements.published.checked = p.published;
  form.elements.homeSelected.checked = p.homeSelected === true;
  form.elements.placement.value = p.placement || "gallery";
  form.elements.presentation.value = p.presentation || "auto";
  form.elements.group.value = p.group || "";
  form.elements.featured.checked = p.featured;
  function refreshCompositionOptions() {
    const hero = form.elements.placement.value === "hero";
    form.elements.featured.disabled = !hero;
    if (form.elements.featured.disabled) form.elements.featured.checked = false;
    form.elements.presentation.disabled = hero;
    form.elements.group.disabled = hero || form.elements.presentation.value === "solo";
  }
  form.elements.placement.onchange = refreshCompositionOptions;
  form.elements.presentation.onchange = refreshCompositionOptions;
  refreshCompositionOptions();
  $("#edit-preview").src = image(p);
  $("#photo-dialog").showModal();
}
function syncSettings() {
  const form = $("#settings-form");
  if (!form) return;
  syncSiteForm(form, data);
  applySiteChrome(data);
  dirty();
}
document.querySelectorAll("[data-view]").forEach(
  (button) =>
    (button.onclick = () => {
      if (busy || !data) return;
      syncSettings();
      view = button.dataset.view;
      render();
    }),
);
$("#editor").addEventListener("input", (event) => {
  if (event.target.id === "search") {
    search = event.target.value;
    renderCards();
  } else if (event.target.matches("[data-collection-label]")) {
    collectionTarget(data, event.target.dataset.collectionLabel).label = event.target.value;
    const option = $("#default-collection")?.querySelector(`option[value="${event.target.dataset.collectionLabel}"]`);
    if (option) option.textContent = event.target.value;
    dirty();
  } else if (event.target.matches("[data-collection-description]")) {
    collectionTarget(data, event.target.dataset.collectionDescription).description = event.target.value;
    dirty();
  } else if (event.target.closest("#settings-form")) syncSettings();
});
$("#editor").addEventListener("change", (event) => {
  if (busy || !data) return;
  try {
    const target = event.target;
    if (target.matches("[data-collection-visible]")) {
      setCollectionVisible(data, target.dataset.collectionVisible, target.checked); render();
    }
    if (target.id === "default-collection") { editableCollections(data).default = target.value; dirty(); }
    if (target.id === "default-photo-view") { editableCollections(data).defaultView = target.value; dirty(); }
    if (target.id === "about-library") {
      syncSettings();
      data.site.aboutImage = target.value;
      data.site.aboutImageAlt = data.photos.find(photo => photo.image === target.value)?.alt || data.site.aboutImageAlt;
      render();
    }
    if (target.id === "about-upload-input") uploadAbout(target);
  } catch (error) { notice(error.message, true); render(); }
  if (event.target.id === "category-filter") {
    filter = event.target.value;
    renderCards();
  }
});
$("#editor").addEventListener("click", (event) => {
  if (busy || !data) return;
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.collectionMove) {
    if (moveCollection(data, button.dataset.collectionMove, Number(button.dataset.direction))) render();
  }
  if (button.id === "add-gear" || button.dataset.removeGear !== undefined) {
    syncSettings();
    data.site.gear = gearItems(data.site.gear);
    if (button.id === "add-gear") data.site.gear.push("");
    else data.site.gear.splice(Number(button.dataset.removeGear), 1);
    render();
    if (button.id === "add-gear") $(".equipment-row:last-child input").focus();
  }
  if (button.dataset.socialMove !== undefined) {
    syncSettings();
    const index = Number(button.dataset.socialMove), next = index + Number(button.dataset.direction);
    if (next >= 0 && next < data.site.socials.length) {
      [data.site.socials[index], data.site.socials[next]] = [data.site.socials[next], data.site.socials[index]]; render();
    }
  }
  if (button.id === "upload-about") $("#about-upload-input").click();
  if (button.dataset.placementFilter) {
    placementFilter = button.dataset.placementFilter;
    render();
  }
  if (button.dataset.edit) editPhoto(button.dataset.edit);
  if (button.dataset.toggle) {
    const photo = data.photos.find((p) => p.id === button.dataset.toggle);
    photo.published = !photo.published;
    render();
  }
  if (button.dataset.move) {
    if (
      movePhotoWithinPlacement(
        data,
        button.dataset.move,
        Number(button.dataset.direction),
      )
    )
      render();
  }
  if (button.id === "upload") {
    if (store.mode === "d1" && !store.canUpload) {
      notice("请先配置服务端照片上传凭据。", true);
      return;
    }
    $("#upload-input").click();
  }
  if (button.dataset.deleteCategory) {
    const id = button.dataset.deleteCategory;
    if (collections(data).length === 1 && collections(data)[0].id === id) { notice("请至少保留一个可见的作品集合。", true); return; }
    if (data.photos.some((p) => p.category === id)) {
      notice("请先将这个分类中的照片移到其他分类。", true);
      return;
    }
    data.categories = data.categories.filter((c) => c.id !== id);
    const config = editableCollections(data);
    config.order = config.order.filter(item => item !== id);
    config.default = defaultCollection(data);
    if (filter === id) filter = "all";
    render();
  }
  if (button.id === "add-social") {
    syncSettings();
    data.site.socials.push({ label: "", url: "" });
    render();
  }
  if (button.dataset.removeSocial !== undefined) {
    syncSettings();
    data.site.socials.splice(Number(button.dataset.removeSocial), 1);
    render();
  }
});
$("#editor").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy || !data) return;
  try {
    if (event.target.matches("#new-category")) {
      const values = new FormData(event.target);
      const id = values.get("id").trim(),
        label = values.get("label").trim();
      if (id === "all" || data.categories.some((c) => c.id === id) || !label)
        throw new Error("分类 ID 不可重复或使用 all。");
      data.categories.push({ id, label, visible: true });
      editableCollections(data);
      render();
    }
    if (event.target.id === "settings-form") {
      syncSettings();
      validateContent(data);
      notice("网站内容已应用，请保存更改。");
    }
  } catch (error) {
    notice(error.message, true);
  }
});
$("#photo-form").onsubmit = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const photo = data.photos.find((p) => p.id === editing);
  const title = form.elements.title.value.trim(),
    alt = form.elements.alt.value.trim();
  if (!title || !alt) return;
  Object.assign(photo, {
    title,
    alt,
    category: form.elements.category.value,
    published: form.elements.published.checked,
    homeSelected: form.elements.homeSelected.checked,
    placement: form.elements.placement.value,
    presentation: form.elements.presentation.value,
    group: form.elements.group.value.trim(),
    featured:
      form.elements.placement.value === "hero" &&
      form.elements.featured.checked,
  });
  if (photo.featured) {
    photo.published = true;
    data.photos.forEach((p) => {
      if (p.id !== photo.id) p.featured = false;
    });
  }
  $("#photo-dialog").close();
  render();
};
$("[data-close]").onclick = () => $("#photo-dialog").close();
$("#delete-photo").onclick = () => {
  if (!confirm("从收藏中移除这张照片？原始文件会保留。")) return;
  data.photos = data.photos.filter((p) => p.id !== editing);
  if (previews.has(editing)) {
    URL.revokeObjectURL(previews.get(editing));
    previews.delete(editing);
  }
  $("#photo-dialog").close();
  render();
};
function setBusy(value) {
  busy = value;
  $("#editor").inert = value;
  document.querySelector(".sidebar nav").inert = value;
  $("#disconnect").disabled = value;
  $("#export").disabled = value;
  $("#preview-toggle").disabled = value;
  dirty();
}
$("#upload-input").onchange = async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  if (files.length > 20) {
    notice("每批最多上传 20 张照片。", true);
    event.target.value = "";
    return;
  }
  setBusy(true);
  let count = 0;
  try {
    for (const file of files) {
      notice(`正在处理 ${count + 1} / ${files.length}：${file.name}`);
      progress({ stage: "prepare", completed: count, total: files.length });
      const prepared = await preparePhoto(
        file,
        filter === "all" ? data.categories[0].id : filter,
      );
      prepared.photo.placement =
        placementFilter === "hero" ? "hero" : "gallery";
      data.photos.push(prepared.photo);
      uploads.push(...prepared.uploads);
      previews.set(prepared.photo.id, prepared.preview);
      count++;
      progress({ stage: "prepare", completed: count, total: files.length });
    }
    notice(`已添加 ${count} 张照片，默认隐藏。编辑后保存即可。`);
  } catch (error) {
    notice(`已添加 ${count} 张。${error.message}`, true);
  } finally {
    search = "";
    filter = "all";
    setBusy(false);
    render();
    event.target.value = "";
    $("#save-progress").hidden = true;
  }
};
$("#save").onclick = async () => {
  if (busy || !store) return;
  syncSettings();
  try {
    validateContent(data);
  } catch (error) {
    notice(error.message, true);
    return;
  }
  if (
    store.mode === "github" &&
    !confirm(
      `将更改发布到 ${store.repo} 的 ${store.branch} 分支？main 分支的保存将触发网站更新。`,
    )
  )
    return;
  setBusy(true);
  notice("正在保存照片与内容…");
  try {
    const paths = contentImagePaths(data);
    const pending = uploads.filter((u) => paths.has(u.path));
    if (pending.reduce((sum, u) => sum + u.base64.length, 0) > 28 * 1024 * 1024)
      throw new Error("这批照片较大，请分批保存（每次不超过 28 MB）。");
    const result = await store.save(data, revision, pending, progress);
    revision = result.revision;
    base = JSON.stringify(data);
    uploads = [];
    for (const preview of previews.values()) URL.revokeObjectURL(preview);
    previews.clear();
    notice(
      store.mode === "local"
        ? "保存成功。本机网站已更新；上线需提交并推送到 main。"
        : store.mode === "d1"
          ? "已保存到 D1。网站内容已更新，照片保存在 GitHub。"
          : "已提交到 GitHub。若保存到 main，网站将在 GitHub Pages 部署完成后更新。",
    );
    render();
  } catch (error) {
    notice(error.message, true);
  } finally {
    setBusy(false);
    $("#save-progress").hidden = true;
  }
};
$("#export").onclick = () => {
  if (!data) return;
  syncSettings();
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `gallery-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice("内容 JSON 已导出。照片文件需单独备份，完整历史保存在 GitHub。");
};
$("#disconnect").onclick = async () => {
  if (busy) return;
  if (isDirty() && !confirm("有未保存的更改，确定断开连接？")) return;
  if (store?.mode === "d1") {
    try { await store.disconnect(); base = JSON.stringify(data); }
    catch (error) { notice(error.message, true); }
    return;
  }
  closePreview();
  store?.disconnect();
  store = null;
  data = null;
  uploads = [];
  for (const preview of previews.values()) URL.revokeObjectURL(preview);
  previews.clear();
  $("#editor").innerHTML = '<p class="empty">连接仓库以继续管理。</p>';
  $("#save").disabled = true;
  $("#preview-toggle").disabled = true;
  $("#disconnect").hidden = true;
  $("#connection").textContent = "未连接";
  $("#login-dialog").showModal();
};
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const token = form.elements.token.value.trim();
  form.elements.token.value = "";
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const adapter = new GitHubStore(
      token,
      form.elements.repo.value,
      form.elements.branch.value,
    );
    await connect(adapter);
    $("#login-error").textContent = "";
    $("#login-dialog").close();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function uploadAbout(input) {
  const file = input.files[0];
  if (!file) return;
  syncSettings();
  if (store.mode === "d1" && !store.canUpload) { notice("照片上传尚未配置。", true); input.value = ""; return; }
  setBusy(true);
  try {
    const prepared = await preparePhoto(file, data.categories[0]?.id || "portrait");
    data.site.aboutImage = prepared.photo.image;
    data.site.aboutImageAlt = data.site.name;
    uploads.push(...prepared.uploads.filter(item => item.path === prepared.photo.image));
    previews.set(prepared.photo.image, prepared.preview);
    notice("替换照片已准备好。预览确认后，保存更改即可发布。");
  } catch (error) { notice(error.message, true); }
  finally { setBusy(false); render(); }
}
let previewTimer;
function progress({ stage, completed = 0, total = 0 }) {
  $("#save-progress").hidden = false;
  $("#progress-label").textContent = stage === "prepare" ? `正在处理照片 ${completed} / ${total}`
    : stage === "upload" ? `正在上传图片版本 ${completed} / ${total}`
    : stage === "done" ? "保存完成" : "正在校验并保存内容…";
  const bar = $("#progress-bar");
  if (total && ["prepare", "upload"].includes(stage)) { bar.max = total; bar.value = completed; }
  else bar.removeAttribute("value");
}
function sizePreview() {
  const mobile = $("#preview-device").value === "mobile", width = mobile ? 390 : 1280, height = mobile ? 844 : 800;
  const canvas = $(".preview-canvas"), frame = $("#preview-frame");
  const scale = Math.min(1, canvas.clientWidth / width);
  frame.style.width = width + "px"; frame.style.height = height + "px";
  frame.style.transform = `scale(${scale})`;
  canvas.style.height = height * scale + "px";
}
function sendPreview() {
  if ($("#draft-preview").hidden || !data || !store) return;
  const select = $("#preview-page"), previous = select.value || "entry";
  select.innerHTML = '<option value="entry">默认入口</option>' + collections(data, { includeHidden: true }).map(c => `<option value="${e(c.id)}">${e(c.label)}${c.visible === false ? "（已隐藏）" : ""}</option>`).join("") + '<option value="page:about">简介</option><option value="page:contact">联系</option>';
  select.value = [...select.options].some(o => o.value === previous) ? previous : "entry";
  try {
    const content = previewContent(data, path => new URL(store.image(path), location.href).href, previews);
    if ($("#preview-hidden").checked) { content.photos.forEach(photo => { photo.published = true; }); content.categories.forEach(category => { category.visible = true; }); if (content.collections?.selected) content.collections.selected.visible = true; }
    const page = select.value.startsWith("page:") ? select.value.slice(5) : "portfolio";
    $("#preview-frame").contentWindow.postMessage({ type: "gallery-preview", content, page, category: select.value === "entry" ? defaultCollection(data) : select.value }, location.origin);
    $("#preview-error").textContent = "";
  } catch (error) { $("#preview-error").textContent = `请先完善当前编辑：${configurationError(error.message)}`; }
  sizePreview();
}
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(sendPreview, 180); }
function closePreview() {
  clearTimeout(previewTimer);
  $("#draft-preview").hidden = true;
  $(".studio-columns").classList.remove("with-preview");
  $("#preview-toggle").setAttribute("aria-expanded", "false");
  $("#preview-frame").src = "about:blank";
}
$("#preview-toggle").onclick = () => {
  if (!$("#draft-preview").hidden) { closePreview(); return; }
  syncSettings();
  $("#draft-preview").hidden = false;
  $(".studio-columns").classList.add("with-preview");
  $("#preview-toggle").setAttribute("aria-expanded", "true");
  $("#preview-frame").src = "preview.html";
  sizePreview();
};
$("#preview-close").onclick = () => { closePreview(); $("#preview-toggle").focus(); };
$("#preview-page").onchange = sendPreview;
$("#preview-device").onchange = sizePreview;
$("#preview-hidden").onchange = sendPreview;
new ResizeObserver(sizePreview).observe($(".preview-canvas"));
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== $("#preview-frame").contentWindow) return;
  if (event.data?.type === "gallery-preview-ready") sendPreview();
  if (event.data?.type === "gallery-preview-navigate" && [...$("#preview-page").options].some(option => option.value === event.data.value)) {
    $("#preview-page").value = event.data.value;
    sendPreview();
  }
});
bindPhotoOrdering($("#editor"), { getData: () => data, isBusy: () => busy, onChange: render });
$("#export").disabled = true;
try {
  const local = await getLocalStore();
  if (local) await connect(local);
  else {
    const cloud = await getD1Store();
    if (cloud) await connect(cloud);
    else {
      const config = await backendConfig();
      if (config.adminURL) {
        $("#connection").textContent = "云后台已启用";
        $("#editor").innerHTML = `<section class="panel"><h2>管理摄影作品</h2><p>使用管理员账号登录云后台。</p><a class="text-link" href="${e(config.adminURL)}">打开后台 →</a></section>`;
      } else {
        $("#connection").textContent = "等待 GitHub 连接";
        $("#editor").innerHTML =
          '<p class="empty">连接 GitHub 以管理网站，或使用 npm start 打开本机后台。</p>';
        $("#login-dialog").showModal();
      }
    }
  }
} catch (error) {
  notice(error.message, true);
}
