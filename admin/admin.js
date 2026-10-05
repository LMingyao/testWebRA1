import {
  escapeHTML as e,
  validateContent,
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
import { orderedPhotos, moveVisible, setComposition, photoComposition } from "../app/sequence.js";
import { draftKey, readDraft, writeDraft, deleteDraft, describeChanges } from "./drafts.js";
import { bindWorkflow } from "./workflow.js";
import { studioIcon as icon } from "./ui.js";
import { uploadPanel, validateUploadBatch, bindUploadDropzone } from "./upload-dropzone.js";
let uploadOpen = false, uploadCategory = "", uploadPlacement = "gallery", uploadMessage = "", uploadResults = [];
let draftReady = false, draftTimer, selection = new Set();
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
$("#sidebar-tools-toggle").onclick = event => {
  const button = event.currentTarget, open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  $("#sidebar-tools").dataset.open = String(open);
  $(".sidebar").dataset.toolsOpen = String(open);
};
function notice(message, error = false) {
  $("#notification").textContent = error ? configurationError(message) : message;
  $("#notification").classList.toggle("error", error);
  if (error && /登录已过期/.test(message)) {
    const link = document.createElement("a"); link.href = "/admin/login"; link.target = "_blank"; link.rel = "noopener";
    link.textContent = " 在新窗口登录后，回到这里重试保存 →"; $("#notification").append(link);
  }
}
function isDirty() {
  return data && (JSON.stringify(data) !== base || photoEditState() !== null);
}
function dirty() {
  const changed = isDirty();
  $("#dirty-state").textContent = changed ? "有未保存更改" : "已保存";
  $("#dirty-state").dataset.dirty = String(changed);
  $("#save").disabled = !changed || busy;
  schedulePreview();
  scheduleDraft();
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
  const composition = photoComposition(data, sequenceCollection(), photo);
  const flags = [photo.homeSelected && "精选", photo.featured && "轮播首图", composition.presentation === "solo" && "独立一行", composition.group && "已分组", (photo.alt === photo.title || /^[0-9 _-]+$/.test(photo.alt)) && "描述待完善"].filter(Boolean);
  return `<article class="admin-card" data-card="${e(photo.id)}" data-selected="${selection.has(photo.id)}"><button class="card-image" data-edit="${e(photo.id)}" aria-label="编辑 ${e(photo.title)}"><img src="${e(image(photo))}" alt="${e(photo.alt)}" loading="lazy"></button><label class="composition-choice" title="选择照片编排"><input type="checkbox" data-select-photo="${e(photo.id)}" aria-label="选择 ${e(photo.title)}" ${selection.has(photo.id) ? "checked" : ""}><span class="sr-only">选择编排</span></label><div class="card-info"><div class="card-title" title="${e(photo.title)}">${e(photo.title)}</div><div class="card-meta"><span>${e(categoryName(photo.category))} · ${photo.placement === "hero" ? "轮播" : "画廊"}</span><span class="badge ${photo.published && categoryVisible ? "" : "draft"}">${!photo.published ? "已隐藏" : categoryVisible ? "展示中" : "分类隐藏"}</span></div>${flags.length ? '<div class="card-flags">'+flags.map(flag=>'<span>'+flag+'</span>').join('')+'</div>' : ''}</div><div class="card-actions"><button class="drag-handle" data-drag="${e(photo.id)}" aria-label="拖动排序 ${e(photo.title)}" title="拖动排序">${icon('drag')}</button><button data-move="${e(photo.id)}" data-direction="-1" aria-label="向前移动 ${e(photo.title)}" title="向前移动" ${photo.id === first ? "disabled" : ""}>${icon('up')}</button><button data-move="${e(photo.id)}" data-direction="1" aria-label="向后移动 ${e(photo.title)}" title="向后移动" ${photo.id === last ? "disabled" : ""}>${icon('down')}</button><button data-toggle="${e(photo.id)}" aria-label="${photo.published ? '隐藏' : '展示'} ${e(photo.title)}" title="${photo.published ? '隐藏照片' : '展示照片'}">${icon(photo.published ? 'eye' : 'hidden')}</button><button data-edit="${e(photo.id)}">编辑</button></div></article>`;
}
function syncSelectionControls() {
  const actions = $(".composition-actions");
  if (!actions) return;
  const chosen = visiblePhotos().filter(photo => selection.has(photo.id));
  const count = chosen.length, galleryOnly = chosen.every(photo => photo.placement !== "hero");
  actions.hidden = selection.size === 0;
  $("#selection-count").textContent = `已选 ${count} 张${galleryOnly ? '' : ' · 轮播照片不参与编排'}`;
  actions.querySelectorAll('[data-compose]').forEach(button => { button.disabled = button.dataset.compose !== 'clear' && (count === 0 || !galleryOnly); });
}
function renderCards() {
  const photos = visiblePhotos();
  const boundaries = new Map();
  for (const photo of photos) {
    const placement = photo.placement || "gallery";
    if (!boundaries.has(placement)) boundaries.set(placement, { first: photo.id });
    boundaries.get(placement).last = photo.id;
  }
  $("#photo-list").innerHTML = photos.length
    ? photos.map((photo) => card(photo, boundaries)).join("")
    : '<p class="empty">暂无匹配照片。试试其他分类或搜索关键词。</p>';
  syncSelectionControls();
}
function sequenceCollection() { return placementFilter === "selected" ? "all" : filter !== "all" ? filter : null; }
function visiblePhotos() {
  const query = search.toLowerCase();
  return orderedPhotos(data, sequenceCollection()).filter(p => (filter === "all" || p.category === filter) && matchesArea(p, placementFilter) && `${p.title} ${p.alt}`.toLowerCase().includes(query));
}
function visibleIds() { return visiblePhotos().map(p => p.id); }
function matchesArea(photo, area) {
  return area === "all" || (area === "selected"
    ? photo.homeSelected === true : (photo.placement || "gallery") === area);
}
function renderPhotos() {
  $("#editor").innerHTML =
    `<div class="stats"><div class="stat"><span>照片总数</span><strong>${data.photos.length}</strong></div><div class="stat"><span>正在展示</span><strong>${data.photos.filter((p) => p.published && data.categories.some(category => category.id === p.category && category.visible !== false)).length}</strong></div><div class="stat"><span>作品分类</span><strong>${data.categories.length}</strong></div></div><div class="library-tools"><div class="library-search">${icon("search")}<input id="search" type="search" placeholder="搜索照片或描述…" aria-label="搜索照片" value="${e(search)}"></div><select id="category-filter" aria-label="按分类筛选"><option value="all">全部分类</option>${data.categories.map((c) => `<option value="${e(c.id)}" ${filter === c.id ? "selected" : ""}>${e(c.label)}</option>`).join("")}</select><button class="primary" id="upload" ${data.categories.length ? "" : "disabled"}>${icon("upload")}上传照片</button></div><div class="composition-tools"><span class="composition-scope">编排范围：${sequenceCollection() === "all" ? "精选集合（独立）" : sequenceCollection() ? e(categoryName(sequenceCollection())) + "（独立）" : "当前筛选的照片库"}</span><div class="composition-actions" hidden><span id="selection-count"></span><button data-compose="group">组合成组</button><button data-compose="solo">独立一行</button><button data-compose="auto">恢复自动排版</button><button data-compose="clear">取消选择</button></div></div><div class="admin-grid" id="photo-list"></div><p class="hint import-note">精选集合只显示已勾选“加入精选集合”的展示照片，题材分类页显示该分类全部展示照片。轮播照片不会出现在下方图库。上传后默认隐藏且不加入精选集合，拖动手柄或 ↑ ↓ 调整所在区域的顺序；打开“作品预览”即可比较桌面与手机效果。</p>`;
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
  if (!data.categories.some(category => category.id === uploadCategory)) uploadCategory = data.categories[0]?.id || "";
  $(".library-tools").insertAdjacentHTML("afterend", uploadPanel({open:uploadOpen, categories:data.categories, category:uploadCategory, placement:uploadPlacement, message:uploadMessage, results:uploadResults}));
  $("#upload").setAttribute("aria-expanded", String(uploadOpen));
  $("#upload").setAttribute("aria-controls", "upload-panel");
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
    history: "修改记录",
    maintenance: "运行维护",
  }[view];
  $("#view-description").textContent = {photos:"整理作品、选择精选，并安排展示顺序。",categories:"管理作品集合、导航顺序与默认入口。",settings:"更新个人资料、页面文字与品牌内容。",history:"浏览已保存版本，先预览，再恢复为草稿。",maintenance:"查看服务状态，管理发布与备份。"}[view];
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.removeAttribute("aria-current");
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
  });
  ({
    photos: renderPhotos,
    categories: renderCategories,
    settings: renderSettings,
    history: () => workflow.render("history"),
    maintenance: () => workflow.render("maintenance"),
  })[view]();
  dirty();
}
async function connect(adapter) {
  const loaded = await adapter.load();
  data = validateContent(loaded.data);
  revision = loaded.revision;
  base = JSON.stringify(data);
  store = adapter;
  uploadResults = []; uploadMessage = ""; uploadOpen = false;
  draftReady = false;
  $("#connection").textContent =
    store.mode === "local"
      ? "● 本机管理 · 更改保存到项目文件"
      : store.mode === "d1" ? `● D1 云后台 · ${store.email}` : `● GitHub · ${store.branch}`;
  $("#disconnect").hidden = store.mode === "local";
  $("#save").textContent =
    store.mode === "github" ? `发布到 ${store.branch}` : "保存更改";
  $("#disconnect").textContent = store.mode === "d1" ? "退出登录" : "断开连接";
  $("#export").disabled = false;
  $("#import-backup").disabled = false;
  $("#preview-toggle").disabled = false;
  render();
  document.body.classList.remove("admin-connecting");
  await offerDraft();
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
      window.scrollTo({ top: 0, behavior: "instant" });
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
    if (target.matches("[data-select-photo]")) {
      if (target.checked) selection.add(target.dataset.selectPhoto); else selection.delete(target.dataset.selectPhoto);
      target.closest(".admin-card").dataset.selected = String(target.checked);
      syncSelectionControls();
    }
    if (target.matches("[data-collection-visible]")) {
      setCollectionVisible(data, target.dataset.collectionVisible, target.checked); render();
    }
    if (target.id === "default-collection") { editableCollections(data).default = target.value; dirty(); }
    if (target.id === "default-photo-view") { editableCollections(data).defaultView = target.value; dirty(); }
    if (target.id === "upload-category") uploadCategory = target.value;
    if (target.id === "upload-placement") uploadPlacement = target.value;
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
  if (button.dataset.compose) {
    const action = button.dataset.compose;
    const chosen = visiblePhotos().filter(p => selection.has(p.id));
    if (action === "clear") { selection.clear(); renderCards(); return; }
    if (!chosen.length) { notice("请先选择照片。", true); return; }
    else if (chosen.some(p => p.placement === "hero")) { notice("顶部轮播不使用画廊编排。", true); return; }
    else if (action === "group") {
      if (chosen.length > 3) { notice("一个组合最多三张，请分组操作。", true); return; }
      const group = "group-" + crypto.randomUUID();
      const all = orderedPhotos(data, sequenceCollection()), ids = new Set(chosen.map(p => p.id));
      const insertion = all.findIndex(p => ids.has(p.id));
      const next = all.filter(p => !ids.has(p.id)); next.splice(insertion, 0, ...chosen);
      if (sequenceCollection()) { editableCollections(data).photoOrder ??= {}; data.collections.photoOrder[sequenceCollection()] = next.map(p => p.id); }
      else data.photos = next;
      setComposition(data, chosen.map(p => p.id), "auto", group, sequenceCollection());
    } else setComposition(data, chosen.map(p => p.id), action, "", sequenceCollection());
    render(); notice("编排已应用到草稿，打开作品预览查看效果。");
  }
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
      moveVisible(data, visibleIds(), button.dataset.move, Number(button.dataset.direction), sequenceCollection())
    )
      render();
  }
  if (button.id === "upload") {
    if (store.mode === "d1" && !store.canUpload) {
      notice("请先配置服务端照片上传凭据。", true);
      return;
    }
    uploadOpen = !uploadOpen;
    if (uploadOpen) {
      uploadCategory = filter === "all" ? uploadCategory || data.categories[0]?.id : filter;
      uploadPlacement = placementFilter === "hero" ? "hero" : "gallery";
    }
    renderPhotos();
    if (uploadOpen) $("#upload-panel").scrollIntoView({block:"nearest", behavior:"smooth"});
  }
  if (button.id === "close-upload") { uploadOpen = false; renderPhotos(); $("#upload").focus(); }
  if (button.id === "browse-upload") $("#upload-input").click();
  if (button.dataset.deleteCategory) {
    const id = button.dataset.deleteCategory;
    if (collections(data).length === 1 && collections(data)[0].id === id) { notice("请至少保留一个可见的作品集合。", true); return; }
    if (data.photos.some((p) => p.category === id)) {
      notice("请先将这个分类中的照片移到其他分类。", true);
      return;
    }
    data.categories = data.categories.filter((c) => c.id !== id);
    if (data.collections?.photoOrder) delete data.collections.photoOrder[id];
    if (data.collections?.photoLayout) delete data.collections.photoLayout[id];
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
      notice("网站内容校验通过，可预览后保存更改。");
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
  for (const layout of Object.values(data.collections?.photoLayout || {})) delete layout[editing];
  for (const order of Object.values(data.collections?.photoOrder || {})) { const index = order.indexOf(editing); if (index >= 0) order.splice(index, 1); }
  if (previews.has(editing)) {
    URL.revokeObjectURL(previews.get(editing));
    previews.delete(editing);
  }
  uploadResults = uploadResults.filter(item => item.id !== editing);
  $("#photo-dialog").close();
  render();
};
function setBusy(value) {
  busy = value;
  $("#editor").inert = value;
  document.querySelector(".sidebar nav").inert = value;
  $("#disconnect").disabled = value;
  $("#export").disabled = value || !store || !data;
  $("#import-backup").disabled = value || !store || !data;
  $("#preview-toggle").disabled = value;
  dirty();
}
function uploadStatus(message, error = false) {
  uploadMessage = message;
  if ($("#upload-status")) {
    $("#upload-status").textContent = message;
    $("#upload-status").classList.toggle("error", error);
  }
  if (error) notice(message, true);
}
async function addPhotoFiles(files) {
  if (busy || !data || !store) return;
  const category = uploadCategory, placement = uploadPlacement;
  try {
    if (store.mode === "d1" && !store.canUpload) throw new Error("请先配置服务端照片上传凭据。");
    if (!data.categories.some(item => item.id === category)) throw new Error("请先选择有效的作品分类。");
    validateUploadBatch(files);
  } catch (error) { uploadStatus(error.message, true); return; }
  uploadResults = [];
  $(".upload-results")?.remove();
  setBusy(true);
  let count = 0;
  try {
    for (const file of files) {
      uploadStatus("正在处理 " + (count + 1) + " / " + files.length + "：" + file.name);
      progress({ stage: "prepare", completed: count, total: files.length });
      const prepared = await preparePhoto(file, category, placement);
      data.photos.push(prepared.photo);
      uploads.push(...prepared.uploads);
      previews.set(prepared.photo.id, prepared.preview);
      uploadResults.push({id:prepared.photo.id, name:file.name, preview:prepared.preview});
      count++;
      progress({ stage: "prepare", completed: count, total: files.length });
    }
    uploadStatus("已添加 " + count + " 张照片到 " + categoryName(category) + "，默认隐藏。检查后点击“保存更改”。");
    notice(uploadMessage);
  } catch (error) {
    uploadStatus("已添加 " + count + " 张；" + error.message + " 后续照片尚未处理。", true);
  } finally {
    search = "";
    filter = "all";
    placementFilter = "all";
    setBusy(false);
    render();
    $("#save-progress").hidden = true;
  }
}
bindUploadDropzone(document, {getZone:() => $("#upload-dropzone"), isBusy:() => busy, onFiles:addPhotoFiles, onError:message => uploadStatus(message, true)});
$("#upload-input").onchange = async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (files.length) await addPhotoFiles(files);
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
    if (store.mode !== "d1" && pending.reduce((sum, u) => sum + u.base64.length, 0) > 28 * 1024 * 1024)
      throw new Error("这批照片较大，请分批保存（每次不超过 28 MB）。");
    const result = await store.save(data, revision, pending, progress);
    revision = result.revision;
    clearTimeout(draftTimer);
    await deleteDraft(draftKey(store)).catch(() => {});
    base = JSON.stringify(data);
    uploads = [];
    uploadResults = [];
    uploadMessage = "照片与内容已保存，可以继续添加下一批。";
    for (const preview of previews.values()) URL.revokeObjectURL(preview);
    previews.clear();
    notice(
      store.mode === "local"
        ? "保存成功。本机网站已更新；上线需提交并推送到 main。"
        : store.mode === "d1"
          ? `已保存到 D1。${result.publication?.message || "网站内容已更新，照片保存在 GitHub。"}`
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
  $("#export").disabled = true;
  $("#import-backup").disabled = true;
  $("#preview-toggle").disabled = true;
  $("#disconnect").hidden = true;
  $("#connection").textContent = "未连接";
  document.body.classList.add("admin-connecting");
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
bindPhotoOrdering($("#editor"), { getData: () => data, isBusy: () => busy, onChange: render, getIds: visibleIds, getCollection: sequenceCollection });
const workflow = bindWorkflow({store: () => store, data: () => data, isBusy: () => busy, isDirty, notice, apply: value => {
  for (const url of previews.values()) URL.revokeObjectURL(url);
  previews.clear(); data = value; uploads = []; uploadResults = []; uploadMessage = ""; selection.clear(); view = "photos"; render();
}});
$("#export").disabled = true;
$("#import-backup").disabled = true;
$("#admin-retry").onclick = () => location.reload();
try {
  const local = await getLocalStore();
  if (local) await connect(local);
  else {
    const cloud = await getD1Store();
    if (cloud) await connect(cloud);
    else {
      const config = await backendConfig();
      if (config.adminURL) {
        location.replace(config.adminURL);
      } else {
        $("#connection").textContent = "等待 GitHub 连接";
        $("#editor").innerHTML =
          '<p class="empty">连接 GitHub 以管理网站，或使用 npm start 打开本机后台。</p>';
        $("#login-dialog").showModal();
      }
    }
  }
} catch (error) {
  $("#admin-start-status").textContent = configurationError(error.message);
  $("#admin-retry").hidden = false;
}

function photoEditState() {
  if (!data || !$("#photo-dialog").open || !editing) return null;
  const photo = data.photos.find(p => p.id === editing), form = $("#photo-form");
  if (!photo) return null;
  const values = {}, previous = {};
  for (const key of ["title","alt","category","placement","presentation","group","published","homeSelected","featured"]) {
    const field = form.elements[key];
    values[key] = field.type === "checkbox" ? field.checked : field.value;
    previous[key] = ["published","homeSelected","featured"].includes(key) ? photo[key] === true : photo[key] || (key === "placement" ? "gallery" : key === "presentation" ? "auto" : "");
  }
  return JSON.stringify(values) === JSON.stringify(previous) ? null : {id:editing,values};
}
function draftSnapshot() { return {data,revision,uploads,photoEdit:photoEditState(),savedAt:new Date().toISOString()}; }
$("#photo-form").addEventListener("input",dirty);
$("#photo-dialog").addEventListener("close",dirty);
function scheduleDraft() {
  if (!draftReady || !store || !data) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const key = draftKey(store);
    const action = isDirty() ? writeDraft(key, draftSnapshot()) : deleteDraft(key);
    action.catch(error => notice(error.message, true));
  }, 450);
}
async function offerDraft() {
  try {
    const snapshot = await readDraft(draftKey(store));
    if (!snapshot || (JSON.stringify(snapshot.data) === base && !snapshot.photoEdit)) { draftReady = true; return; }
    const banner = $("#draft-recovery");
    banner.hidden = false;
    banner.innerHTML = `<p>发现 ${e(new Date(snapshot.savedAt).toLocaleString())} 的未保存草稿${snapshot.revision !== revision ? "；云端内容已更新，需要核对差异" : ""}。</p><button id="recover-draft">查看并恢复</button><button id="discard-draft">放弃本机草稿</button>`;
    $("#editor").inert = true;
    $("#recover-draft").onclick = () => {
      const differences = describeChanges(data, snapshot.data);
      if (snapshot.photoEdit) differences.push("尚未应用的照片表单编辑");
      if (!confirm(`恢复为新草稿？${snapshot.revision !== revision ? "云端已变化，保存将以当前云端版本为基准。请核对以下差异。" : ""}\n${differences.slice(0,20).join("\n")}`)) return;
      try {
        data = validateContent(snapshot.data); uploads = snapshot.uploads || [];
        for (const photo of data.photos) {
          const upload = uploads.find(item => item.path === photo.image);
          if (upload) previews.set(photo.id, URL.createObjectURL(new Blob([Uint8Array.from(atob(upload.base64), c=>c.charCodeAt(0))],{type:'image/webp'})));
        }
        const aboutUpload = uploads.find(item => item.path === data.site.aboutImage);
        if (aboutUpload) previews.set(data.site.aboutImage, URL.createObjectURL(new Blob([Uint8Array.from(atob(aboutUpload.base64), c=>c.charCodeAt(0))],{type:'image/webp'})));
        draftReady = true; banner.hidden = true; $("#editor").inert = false; render();
        if (snapshot.photoEdit && data.photos.some(p => p.id === snapshot.photoEdit.id)) {
          editPhoto(snapshot.photoEdit.id);
          for (const key of ["title","alt","category","placement","presentation","group","published","homeSelected","featured"]) {
            const field = $("#photo-form").elements[key], value = snapshot.photoEdit.values[key];
            if (field.type === "checkbox") field.checked = value === true; else field.value = value;
          }
          dirty();
        }
        notice("草稿已恢复，请预览并核对后保存。");
      } catch (error) { notice(error.message, true); }
    };
    $("#discard-draft").onclick = async () => {
      await deleteDraft(draftKey(store)); draftReady = true; banner.hidden = true; $("#editor").inert = false;
    };
  } catch (error) { draftReady = true; notice(error.message, true); }
}
window.addEventListener('pagehide', () => {
  if (draftReady && store && isDirty()) writeDraft(draftKey(store),draftSnapshot()).catch(()=>{});
});
