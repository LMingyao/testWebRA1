import { siteSettings, gearItems, collections, defaultCollection } from '../app/config.js';
// Private drafts contain content and pending images, never authentication secrets.
let connection;
function database() {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('gallery-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法保存本机草稿，请导出备份。'));
  });
}
async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode), request = action(tx.objectStore('drafts'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('本机草稿存储失败，请导出备份。'));
  });
}
export const draftKey = store => `${location.origin}:${store.mode}:${store.repo || ''}:${store.branch || ''}`;
export const readDraft = key => transaction('readonly', store => store.get(key));
export const writeDraft = (key, value) => transaction('readwrite', store => store.put(structuredClone(value), key));
export const deleteDraft = key => transaction('readwrite', store => store.delete(key));
export function describeChanges(previous, next) {
  const labels = {name:"摄影师名称",tagline:"品牌描述",location:"所在城市",email:"联系邮箱",description:"网站简介",aboutTitle:"简介标题",about:"个人介绍",aboutImage:"简介照片",gear:"摄影器材",socials:"社交链接",shareImage:"分享封面",brandName:"Logo 上行",brandTitle:"Logo 主文字",workLabel:"作品菜单",aboutLabel:"简介菜单",contactLabel:"联系菜单",contactText:"联系说明",contactLinkLabel:"联系链接",gearLabel:"器材标题",aboutImageAlt:"简介照片描述",footerText:"版权说明",showAbout:"简介导航显示",showContact:"联系导航显示"};
  const lines = [];
  const oldSite = {...siteSettings(previous.site),gear:gearItems(previous.site.gear)};
  const newSite = {...siteSettings(next.site),gear:gearItems(next.site.gear)};
  for (const key of new Set([...Object.keys(oldSite), ...Object.keys(newSite)]))
    if (JSON.stringify(oldSite[key]) !== JSON.stringify(newSite[key])) lines.push(`网站内容：${labels[key] || "其他资料"}`);
  if (JSON.stringify(previous.categories) !== JSON.stringify(next.categories)) lines.push('分类名称、顺序或显示状态');
  const settings = data => ({default:defaultCollection(data),view:data.collections?.defaultView || 'multi',items:collections(data,{includeHidden:true}),photoOrder:data.collections?.photoOrder || {},photoLayout:data.collections?.photoLayout || {}});
  if (JSON.stringify(settings(previous)) !== JSON.stringify(settings(next))) lines.push('默认入口、精选设置或集合排序');
  const old = new Map(previous.photos.map(p => [p.id, p])), fresh = new Map(next.photos.map(p => [p.id, p]));
  for (const p of next.photos) {
    if (!old.has(p.id)) lines.push(`新增照片：${p.title}`);
    else if (JSON.stringify(old.get(p.id)) !== JSON.stringify(p)) lines.push(`修改照片：${p.title}`);
  }
  for (const p of previous.photos) if (!fresh.has(p.id)) lines.push(`移除记录：${p.title}`);
  if (previous.photos.map(p => p.id).join() !== next.photos.map(p => p.id).join()) lines.push('照片库顺序');
  return lines;
}
