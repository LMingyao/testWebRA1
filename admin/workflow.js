import { escapeHTML as e, validateContent, contentImagePaths } from '../app/shared.js';
import { describeChanges } from './drafts.js';

export function bindWorkflow({ store, data, apply, notice, isDirty }) {
  const render = async view => {
    const body = document.createElement('section'); body.className = 'workflow-page';
    body.setAttribute('aria-label', view === 'maintenance' ? '运行维护' : '修改记录');
    document.querySelector('#editor').replaceChildren(body);
    const show = html => { if (body.isConnected) body.innerHTML = html; };
    if (view === 'maintenance') {
    if (store()?.mode !== 'd1') { show('<section class="panel"><p>运行维护功能需要连接 D1 云后台。</p></section>'); return; }
    show('<section class="panel"><p role="status">正在检查服务与媒体清单…</p></section>');
    try {
      const s = await store().request('health');
      if (!body.isConnected) return;
      show(`<section class="panel"><h2>服务状态</h2><dl><dt>数据库</dt><dd>${s.database ? '正常' : '异常'}</dd><dt>上传权限</dt><dd>${e(s.upload.message)}</dd><dt>照片读取</dt><dd>${e(s.mediaPreview.message)}</dd><dt>网站发布</dt><dd>${e(s.publication.message)}</dd></dl><p class="hint">已登记媒体 ${s.mediaCount} 个；最近保存 ${e(s.updatedAt)}。此检查不会修改网站。</p></section><section class="panel"><h2>发布与备份</h2><p class="hint">保存更新云端内容；静态页面和分享信息的部署进度可在这里检查、重试。</p><div class="maintenance-actions"><button id="retry-publication" class="secondary">同步网站与分享信息</button><button id="media-report" class="secondary">检查未使用文件</button><button id="full-backup" class="secondary">下载完整备份清单</button></div><div id="maintenance-result" role="status"></div></section>`);
      body.querySelector('#retry-publication').onclick = async () => {
        const button=body.querySelector('#retry-publication'); button.disabled=true;
        try { const r = await store().request('publish', {method:'POST'}); notice(r.message, r.status !== 'submitted'); if(body.isConnected) await render('maintenance'); }
        catch (error) { notice(error.message, true); }
        finally { button.disabled=false; }
      };
      body.querySelector('#media-report').onclick = async () => {
        try {
          const r = await store().request('media-report');
          body.querySelector('#maintenance-result').innerHTML = `<h3>未使用文件</h3><p class="hint">保留当前内容及最近 20 次历史引用。${e(r.note)}</p>${r.unused.length ? `<ul>${r.unused.map(p=>`<li>${e(p.path)} · ${Math.round(p.bytes/1024)} KB${p.unregistered?' · 未登记':''}</li>`).join('')}</ul>` : '<p>没有发现未使用文件。</p>'}`;
        } catch (error) { notice(error.message, true); }
      };
      body.querySelector('#full-backup').onclick = async () => {
        try { download(await store().request('backup'), 'gallery-backup-manifest.json'); notice('内容、历史与媒体清单已导出；照片文件请使用本机完整备份工具下载。'); }
        catch (error) { notice(error.message, true); }
      };
    } catch (error) { show(`<section class="panel"><p>${e(error.message)}</p></section>`); }
    return;
    }
    if (store()?.mode !== 'd1') { show('<section class="panel"><p>历史恢复需要连接 D1 云后台。</p></section>'); return; }
    show('<p>正在读取修改记录…</p>');
    try {
      const r = await store().request('history');
      if (!body.isConnected) return;
      show(`<section class="panel"><h2>已保存版本</h2><p class="hint">恢复先成为草稿，预览后保存才会发布。当前云端版本也会保留在历史中。</p>${r.entries.map(item=>`<button class="history-item" data-history="${item.sequence}"><span>${e(item.saved_at)}</span><span>${e(item.name)} · 查看版本 →</span></button>`).join('') || '<p class="empty">暂无历史记录。</p>'}</section>`);
      body.querySelectorAll('[data-history]').forEach(button => button.onclick = async () => {
        try {
          const record = await store().request(`history/${button.dataset.history}`);
          if (!body.isConnected) return;
          const changes = describeChanges(data(), record.data);
          show(`<section class="panel"><button id="history-back" class="secondary">← 返回修改记录</button><h2>恢复预览</h2><p class="hint">保存于 ${e(button.textContent)}。恢复不会立即更改线上网站。</p><ul>${changes.map(line=>`<li>${e(line)}</li>`).join('') || '<li>内容相同</li>'}</ul><button id="restore-history" class="primary">恢复为草稿</button></section>`);
          body.querySelector('#history-back').onclick = () => render('history');
          body.querySelector('#restore-history').onclick = () => {
            if (isDirty() && !confirm('恢复会替换当前未保存的草稿，是否继续？')) return;
            apply(validateContent(record.data)); notice('历史已恢复为草稿，请预览后保存。');
          };
        } catch (error) { notice(error.message, true); }
      });
    } catch (error) { show(`<p>${e(error.message)}</p>`); }
  };
  document.querySelector('#import-backup').onclick = () => document.querySelector('#backup-input').click();
  document.querySelector('#backup-input').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 12 * 1024 * 1024) throw new Error('备份文件过大。');
      const backup = JSON.parse(await file.text()), content = validateContent(backup.data || backup);
      if (!confirm('将备份内容打开为新草稿？现有未保存编辑将被替换。照片文件必须仍存在。')) return;
      apply(content); notice(`备份已打开为草稿，含 ${contentImagePaths(content).size} 个媒体引用。请预览后保存。`);
    } catch (error) { notice(error.message, true); }
    finally { event.target.value = ''; }
  };
  return {render};
}
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
