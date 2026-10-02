import { escapeHTML as e } from "../app/shared.js";
import { collections, defaultCollection, editableCollections, gearItems, siteSettings } from "../app/config.js";

export function collectionTarget(data, id) {
  return id === "all" ? editableCollections(data).selected : data.categories.find(item => item.id === id);
}
export function moveCollection(data, id, direction) {
  const config = editableCollections(data), order = config.order;
  const index = order.indexOf(id), next = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || next < 0 || next >= order.length) return false;
  [order[index], order[next]] = [order[next], order[index]];
  return true;
}
export function setCollectionVisible(data, id, visible) {
  const target = collectionTarget(data, id);
  if (!target) return false;
  if (!visible && collections(data).length === 1 && target.visible !== false)
    throw new Error("Keep at least one collection visible.");
  target.visible = visible;
  const config = editableCollections(data);
  config.default = defaultCollection(data);
  return true;
}
export function renderCollectionEditor(data) {
  const items = collections(data, { includeHidden: true });
  return `<section class="panel"><h2>作品集合与导航</h2><p class="hint">这里的顺序决定作品菜单的排列。首页精选是一个精选集合，照片仍保留题材分类。隐藏题材分类后，该分类照片也会退出公开精选；照片本身的展示开关保持不变。</p>
    <div class="category-list">${items.map((item, index) => `<section class="collection-row" data-collection="${e(item.id)}">
      <div class="collection-heading"><code>${e(item.id)}</code><span class="badge">${item.id === "all" ? "精选集合" : "题材分类"}</span><div class="collection-actions"><button data-collection-move="${e(item.id)}" data-direction="-1" aria-label="${e(item.label)}上移" ${index === 0 ? "disabled" : ""}>↑</button><button data-collection-move="${e(item.id)}" data-direction="1" aria-label="${e(item.label)}下移" ${index === items.length - 1 ? "disabled" : ""}>↓</button></div></div>
      <label>显示名称<input data-collection-label="${e(item.id)}" value="${e(item.label)}" maxlength="80" required></label>
      <label>集合简介<textarea data-collection-description="${e(item.id)}" rows="2" maxlength="400">${e(item.description || "")}</textarea></label>
      <div class="collection-footer"><label class="inline-check"><input type="checkbox" data-collection-visible="${e(item.id)}" ${item.visible !== false ? "checked" : ""}>在网站显示</label>${item.id !== "all" ? `<button data-delete-category="${e(item.id)}">删除分类</button>` : ""}</div></section>`).join("")}</div>
    <div class="form-grid"><label>默认进入的集合<select id="default-collection">${collections(data).map(item => `<option value="${e(item.id)}" ${item.id === defaultCollection(data) ? "selected" : ""}>${e(item.label)}</option>`).join("")}</select></label><label>默认浏览方式<select id="default-photo-view"><option value="multi" ${data.collections?.defaultView !== "single" ? "selected" : ""}>多图浏览</option><option value="single" ${data.collections?.defaultView === "single" ? "selected" : ""}>单图浏览</option></select></label></div>
    <p class="hint">默认入口用于首页和 Logo 链接，分类直达链接仍进入对应分类。默认集合被隐藏或删除时，自动改为第一个可见集合。可见的空集合也会保留在导航里。</p>
    <form id="new-category" class="new-category"><input name="id" placeholder="固定 ID，例如 travel" aria-label="分类 ID" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required maxlength="60"><input name="label" placeholder="显示名称" aria-label="分类名称" required maxlength="80"><button class="primary" type="submit">添加分类</button></form></section>`;
}
export const siteTextFields = ["name", "tagline", "location", "email", "description", "aboutTitle", "about", "aboutImage", "brandName", "brandTitle", "workLabel", "aboutLabel", "contactLabel", "contactText", "contactLinkLabel", "gearLabel", "aboutImageAlt", "footerText"];
export function renderSiteEditor(data, image) {
  const site = siteSettings(data.site);
  const field = (key, label, multiline = false) => `<label>${label}${multiline ? `<textarea name="${key}" rows="4">${e(site[key])}</textarea>` : `<input name="${key}" value="${e(site[key])}" ${key === "email" ? 'type="email"' : ""}>`}</label>`;
  return `<section class="panel"><form class="settings-form" id="settings-form">
    <h2>品牌与个人资料</h2><div class="form-grid">${field("name", "摄影师名称")}${field("location", "所在城市")}${field("email", "联系邮箱")}${field("tagline", "品牌无障碍描述")}${field("brandName", "Logo 上行文字")}${field("brandTitle", "Logo 主文字")}</div>${field("description", "网站简介", true)}
    <h2>导航与页面文字</h2><div class="form-grid">${field("workLabel", "作品菜单名称")}${field("aboutLabel", "简介菜单名称")}${field("contactLabel", "联系菜单名称")}${field("contactLinkLabel", "联系链接文字")}</div><div class="check-row">${["About", "Contact"].map(page => `<label class="inline-check"><input type="checkbox" name="show${page}" ${site[`show${page}`] ? "checked" : ""}>在导航显示${page === 'About' ? '简介' : '联系'}</label>`).join("")}</div>${field("contactText", "联系页面说明")}${field("footerText", "页脚版权说明")}
    <h2>简介页面</h2>${field("aboutTitle", "简介标题")}${field("about", "个人介绍（空行分段）", true)}
    <div class="about-image-editor"><img src="${e(image(site.aboutImage))}" alt="当前简介照片"><div><label>简介照片<select id="about-library"><option value="${e(site.aboutImage)}">保留当前照片</option>${data.photos.map(photo => `<option value="${e(photo.image)}">${e(photo.title)}${photo.published ? "" : "（未在画廊发布）"}</option>`).join("")}</select></label><input type="hidden" name="aboutImage" value="${e(site.aboutImage)}"><button type="button" class="secondary" id="upload-about">上传替换照片</button><input id="about-upload-input" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="hint">选中的照片会在简介页公开显示，即使它没有在画廊发布。上传替换只更换简介照片，不会向作品画廊添加照片。</p></div></div>${field("aboutImageAlt", "照片无障碍描述")}
    <h2>摄影器材</h2>${field("gearLabel", "器材区域标题")}<div class="equipment-list">${gearItems(site.gear).map((item, i) => `<div class="equipment-row"><label class="sr-only" for="gear-${i}">器材 ${i + 1}</label><input id="gear-${i}" name="gear-${i}" data-gear value="${e(item)}" maxlength="200" placeholder="相机、镜头或配件"><button type="button" data-remove-gear="${i}" aria-label="移除器材 ${i + 1}">×</button></div>`).join("")}</div><button type="button" class="secondary" id="add-gear">添加一件器材</button>
    <h2>社交链接</h2><p class="hint">前两个链接作为主要平台显示，用箭头调整顺序。</p><div class="social-list">${site.socials.map((social, i) => `<div class="social-row"><input name="social-label-${i}" value="${e(social.label)}" aria-label="社交平台 ${i + 1}" required><input name="social-url-${i}" type="url" value="${e(social.url)}" aria-label="社交链接 ${i + 1}" required><div class="social-actions"><button type="button" data-social-move="${i}" data-direction="-1" aria-label="链接上移" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-social-move="${i}" data-direction="1" aria-label="链接下移" ${i === site.socials.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove-social="${i}" aria-label="移除链接">×</button></div></div>`).join("")}</div><button type="button" class="secondary" id="add-social">添加社交链接</button>
    <button type="submit" class="primary">应用网站内容</button><p class="hint">先预览草稿，再点右上角“保存更改”发布。访客下次打开或刷新页面会读取新内容，已打开的页面不会自动刷新。搜索引擎读取的静态元信息仍需重新部署同步。</p></form></section>`;
}
export function syncSiteForm(form, data) {
  const values = new FormData(form);
  for (const key of siteTextFields) data.site[key] = values.get(key);
  data.site.gear = [...form.querySelectorAll("[data-gear]")].map(input => input.value.trim());
  for (const key of ["showAbout", "showContact"]) data.site[key] = values.has(key);
  data.site.socials = data.site.socials.map((social, i) => ({ label: values.get(`social-label-${i}`), url: values.get(`social-url-${i}`) }));
}

export function configurationError(message) {
  const translations = {
    "Keep at least one collection visible.": "请至少保留一个可见的作品集合。",
    "Choose a visible collection as the default entry.": "请选择一个可见集合作为默认入口。",
    "Equipment must be a list of up to 100 nonempty items (200 characters each).": "器材最多 100 件，每件需填写名称（最多 200 个字符）。空项请填写或删除。",
    "Invalid category visibility.": "分类显示设置无效。",
    "Invalid selected collection.": "精选集合设置无效，请检查名称和简介。",
    "Collection order must contain unique existing IDs.": "集合顺序无效，请重新整理分类。",
    "Invalid default view.": "请选择单图或多图浏览。",
  };
  if (/^Use 1–80 characters for /.test(message)) return "标题或菜单名称需填写 1–80 个字符。";
  if (/^Use up to 400 characters for /.test(message)) return "页面说明最多 400 个字符。";
  return translations[message] || message;
}
