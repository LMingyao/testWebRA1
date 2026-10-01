import {
  escapeHTML as e,
  validateContent,
  movePhotoWithinPlacement,
  contentImagePaths,
} from "../app/shared.js";
import { getLocalStore, GitHubStore } from "./store.js";
import { preparePhoto } from "./images.js";
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
  $("#notification").textContent = message;
  $("#notification").classList.toggle("error", error);
}
function isDirty() {
  return data && JSON.stringify(data) !== base;
}
function dirty() {
  const changed = isDirty();
  $("#dirty-state").textContent = changed ? "有未保存的更改" : "已保存";
  $("#save").disabled = !changed || busy;
}
function image(photo) {
  return previews.get(photo.id) || store.image(photo.thumbnail || photo.image);
}
function categoryName(id) {
  return data.categories.find((c) => c.id === id)?.label || id;
}
function card(photo, boundaries) {
  const { first, last } = boundaries.get(photo.placement || "gallery");
  return `<article class="admin-card"><button data-edit="${e(photo.id)}" aria-label="编辑 ${e(photo.title)}"><img src="${e(image(photo))}" alt="${e(photo.alt)}" loading="lazy"></button><div class="card-info"><div class="card-title">${e(photo.title)} ${photo.homeSelected ? " · 首页精选" : ""}${photo.featured ? " · 轮播首图" : ""}</div><div class="card-meta"><span>${e(categoryName(photo.category))} · ${photo.placement === "hero" ? "顶部轮播" : "作品画廊"}</span><span class="badge ${photo.published ? "" : "draft"}">${photo.published ? "展示中" : "已隐藏"}</span></div></div><div class="card-actions"><button data-move="${e(photo.id)}" data-direction="-1" aria-label="向前移动 ${e(photo.title)}" ${photo.id === first ? "disabled" : ""}>↑</button><button data-move="${e(photo.id)}" data-direction="1" aria-label="向后移动 ${e(photo.title)}" ${photo.id === last ? "disabled" : ""}>↓</button><button data-toggle="${e(photo.id)}">${photo.published ? "隐藏" : "展示"}</button><button data-edit="${e(photo.id)}">编辑</button></div></article>`;
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
    `<div class="stats"><div class="stat"><span>照片总数</span><strong>${data.photos.length}</strong></div><div class="stat"><span>正在展示</span><strong>${data.photos.filter((p) => p.published).length}</strong></div><div class="stat"><span>作品分类</span><strong>${data.categories.length}</strong></div></div><div class="library-tools"><input id="search" type="search" placeholder="搜索照片…" aria-label="搜索照片" value="${e(search)}"><select id="category-filter" aria-label="按分类筛选"><option value="all">全部分类</option>${data.categories.map((c) => `<option value="${e(c.id)}" ${filter === c.id ? "selected" : ""}>${e(c.label)}</option>`).join("")}</select><button class="primary" id="upload" ${data.categories.length ? "" : "disabled"}>＋ 上传照片</button></div><div class="admin-grid" id="photo-list"></div><p class="hint import-note">首页只显示已勾选“首页精选”的展示照片，分类页显示该分类全部展示照片。轮播照片不会出现在下方图库。上传后默认隐藏且不加入精选，↑ ↓ 调整所在区域的顺序。</p>`;
  $(".stats").insertAdjacentHTML(
    "afterend",
    `<div class="library-areas">${[
        { id: "all", label: "全部照片" },
        { id: "selected", label: "首页精选" },
        { id: "gallery", label: "作品画廊" },
        { id: "hero", label: "顶部轮播" },
      ].map((area) =>
        `<button data-placement-filter="${area.id}" aria-pressed="${placementFilter === area.id}">${area.label} <small>${data.photos.filter((photo) => matchesArea(photo, area.id)).length}</small></button>`,
      ).join("")}</div>`,
  );
  renderCards();
}
function renderCategories() {
  $("#editor").innerHTML =
    `<section class="panel"><h2>组织你的收藏</h2><p class="hint">修改分类名称会同步更新网站筛选标签。有照片的分类需先转移照片再删除。</p><div class="category-list">${data.categories.map((c) => `<div class="category-row"><code>${e(c.id)}</code><input data-category-label="${e(c.id)}" value="${e(c.label)}" aria-label="${e(c.id)} 分类名称" maxlength="80"><span>${data.photos.filter((p) => p.category === c.id).length} 张</span><button data-delete-category="${e(c.id)}">删除</button></div>`).join("")}</div><form id="new-category" class="new-category"><input name="id" placeholder="分类 ID，例如 travel" aria-label="分类 ID" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required maxlength="60"><input name="label" placeholder="展示名称" aria-label="分类名称" required maxlength="80"><button class="primary" type="submit">添加分类</button></form></section>`;
}
function field(name, label, type = "input") {
  return `<label>${label}${type === "textarea" ? `<textarea name="${name}" rows="4">${e(data.site[name])}</textarea>` : `<input name="${name}" value="${e(data.site[name])}" ${name === "email" ? 'type="email"' : ""} required>`}</label>`;
}
function renderSettings() {
  $("#editor").innerHTML =
    `<section class="panel"><form class="settings-form" id="settings-form"><h2>网站内容</h2><div class="form-grid">${field("name", "摄影师名称")}${field("tagline", "品牌无障碍描述")}${field("location", "所在城市")}${field("email", "联系邮箱")}</div>${field("description", "搜索引擎简介", "textarea")}${field("aboutTitle", "关于页面标题")}${field("about", "个人介绍", "textarea")}${field("aboutImage", "关于页面图片路径")}${field("gear", "摄影器材", "textarea")}<h2>社交链接</h2><div class="social-list">${data.site.socials.map((s, i) => `<div class="social-row"><input name="social-label-${i}" value="${e(s.label)}" aria-label="社交平台 ${i + 1}" required><input name="social-url-${i}" type="url" value="${e(s.url)}" aria-label="社交链接 ${i + 1}" required><button type="button" data-remove-social="${i}" aria-label="移除社交链接 ${i + 1}">×</button></div>`).join("")}</div><button type="button" class="secondary" id="add-social">＋ 添加链接</button><button type="submit" class="primary">应用网站内容</button><p class="hint">应用后，点击右上角“保存更改”写入网站。</p></form></section>`;
}
function render() {
  if (!data) return;
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
      : `● GitHub · ${store.branch}`;
  $("#disconnect").hidden = store.mode === "local";
  $("#save").textContent =
    store.mode === "local" ? "保存更改" : `发布到 ${store.branch}`;
  $("#export").disabled = false;
  render();
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
  form.elements.featured.checked = p.featured;
  form.elements.featured.disabled = form.elements.placement.value !== "hero";
  form.elements.placement.onchange = () => {
    form.elements.featured.disabled = form.elements.placement.value !== "hero";
    if (form.elements.featured.disabled) form.elements.featured.checked = false;
  };
  $("#edit-preview").src = image(p);
  $("#photo-dialog").showModal();
}
function syncSettings() {
  const form = $("#settings-form");
  if (!form) return;
  const values = new FormData(form);
  for (const key of [
    "name",
    "tagline",
    "location",
    "email",
    "description",
    "aboutTitle",
    "about",
    "aboutImage",
    "gear",
  ])
    data.site[key] = values.get(key);
  data.site.socials = data.site.socials.map((s, i) => ({
    label: values.get(`social-label-${i}`),
    url: values.get(`social-url-${i}`),
  }));
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
  } else if (event.target.matches("[data-category-label]")) {
    data.categories.find(
      (c) => c.id === event.target.dataset.categoryLabel,
    ).label = event.target.value;
    dirty();
  } else if (event.target.closest("#settings-form")) syncSettings();
});
$("#editor").addEventListener("change", (event) => {
  if (event.target.id === "category-filter") {
    filter = event.target.value;
    renderCards();
  }
});
$("#editor").addEventListener("click", (event) => {
  if (busy || !data) return;
  const button = event.target.closest("button");
  if (!button) return;
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
  if (button.id === "upload") $("#upload-input").click();
  if (button.dataset.deleteCategory) {
    const id = button.dataset.deleteCategory;
    if (data.photos.some((p) => p.category === id)) {
      notice("请先将这个分类中的照片移到其他分类。", true);
      return;
    }
    data.categories = data.categories.filter((c) => c.id !== id);
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
      data.categories.push({ id, label });
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
    const result = await store.save(data, revision, pending);
    revision = result.revision;
    base = JSON.stringify(data);
    uploads = [];
    for (const preview of previews.values()) URL.revokeObjectURL(preview);
    previews.clear();
    notice(
      store.mode === "local"
        ? "保存成功。本机网站已更新；上线需提交并推送到 main。"
        : "已提交到 GitHub。若保存到 main，网站将在 GitHub Pages 部署完成后更新。",
    );
    render();
  } catch (error) {
    notice(error.message, true);
  } finally {
    setBusy(false);
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
$("#disconnect").onclick = () => {
  if (busy) return;
  if (isDirty() && !confirm("有未保存的更改，确定断开连接？")) return;
  store?.disconnect();
  store = null;
  data = null;
  uploads = [];
  for (const preview of previews.values()) URL.revokeObjectURL(preview);
  previews.clear();
  $("#editor").innerHTML = '<p class="empty">连接仓库以继续管理。</p>';
  $("#save").disabled = true;
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
$("#export").disabled = true;
try {
  const local = await getLocalStore();
  if (local) await connect(local);
  else {
    $("#connection").textContent = "等待 GitHub 连接";
    $("#editor").innerHTML =
      '<p class="empty">连接 GitHub 以管理网站，或使用 npm start 打开本机后台。</p>';
    $("#login-dialog").showModal();
  }
} catch (error) {
  notice(error.message, true);
}
