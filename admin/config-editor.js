import { collectionEditorView, siteEditorView } from "./editor-views.js";
import { collections, defaultCollection, editableCollections } from "../app/config.js";

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
export function renderCollectionEditor(data) { return collectionEditorView(data); }
export const siteTextFields = ["name", "tagline", "location", "email", "description", "aboutTitle", "about", "aboutImage", "shareImage", "brandName", "brandTitle", "workLabel", "aboutLabel", "contactLabel", "contactText", "contactLinkLabel", "gearLabel", "aboutImageAlt", "footerText"];
export function renderSiteEditor(data, image) { return siteEditorView(data, image); }
export function syncSiteForm(form, data) {
  const values = new FormData(form);
  for (const key of siteTextFields) data.site[key] = values.get(key);
  if (!data.site.shareImage) delete data.site.shareImage;
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
    "Invalid collection photo order.": "集合的照片排序无效，请刷新后重试。",
    "Invalid collection composition.": "集合的编排设置无效，请重新整理。",
    "Invalid sharing image.": "分享封面无效，请重新选择。",
    "Invalid default view.": "请选择单图或多图浏览。",
  };
  if (/^Use 1–80 characters for /.test(message)) return "标题或菜单名称需填写 1–80 个字符。";
  if (/^Use up to 400 characters for /.test(message)) return "页面说明最多 400 个字符。";
  return translations[message] || message;
}
