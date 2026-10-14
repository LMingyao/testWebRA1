import { escapeHTML as e } from "../app/shared.js";

export function validateBackupReceipt(report) {
  if (!report || typeof report !== "object" || report.format !== "gallery-backup-check-v1" || report.result !== "verified" ||
      !Number.isInteger(report.mediaCount) || report.mediaCount < 0 ||
      !Number.isSafeInteger(report.mediaBytes) || report.mediaBytes < 0 ||
      typeof report.revision !== "string" || !report.revision || report.revision.length > 200 ||
      !/^[a-f0-9]{64}$/.test(report.manifestDigest || "") ||
      !Number.isFinite(Date.parse(report.verifiedAt)) || Date.parse(report.verifiedAt) > Date.now() + 300000)
    throw new Error("请选择完整备份工具生成的 backup-report.json 校验报告。");
  return {format:report.format, result:report.result, verifiedAt:report.verifiedAt, revision:report.revision,
    mediaCount:report.mediaCount, mediaBytes:report.mediaBytes, manifestDigest:report.manifestDigest};
}
export function backupGuideHTML(receipt) {
  let last = "尚未记录完整照片备份";
  if (receipt) last = `${new Date(receipt.verifiedAt).toLocaleString("zh-CN")} · ${receipt.mediaCount} 个照片文件`;
  return `<section class="panel backup-guide"><h2>完整备份与恢复</h2><p class="hint">“导出备份”只包含内容 JSON。完整备份还包括网站使用的照片和最近 20 次修改记录；原始照片与登录凭据需另行保管。</p>
    <div class="backup-last"><strong>最近完整备份校验</strong><p>${e(last)}</p><small>依据你导入的本机校验报告，仅记录在本浏览器。下载清单不会自动标记备份完成。</small></div>
    <ol class="backup-steps"><li><h3>下载清单</h3><p>从已登录的后台下载当前云端内容、历史与媒体清单。</p><button id="full-backup" class="secondary">下载完整备份清单</button></li>
    <li><h3>下载并校验照片</h3><p>在项目文件夹中运行完整备份工具，将下载的清单路径和新的备份文件夹填入下方命令。完成后保存整个文件夹，而非只保存 JSON。</p><pre><code>node tools/backup.mjs "gallery-backup-manifest.json" "backup-directory"
node tools/backup.mjs --verify "backup-directory"</code></pre><p class="hint">工具逐个下载并核对文件大小与 SHA-256。备份包含照片、manifest.json、restore-content.sql 和 backup-report.json。</p><div class="backup-report-picker"><button id="choose-backup-report" class="secondary">选择校验报告</button><span class="hint">选择 backup-report.json 以记录完成时间</span><input id="backup-report-input" type="file" accept="application/json,.json" hidden></div></li>
    <li><h3>恢复时先检查</h3><p>只改内容：使用“导入备份”打开 manifest.json，先检查草稿，再保存；这不会恢复已丢失的照片文件。</p><p>完整恢复：先在空数据库中执行迁移和 restore-content.sql，并将备份照片按原路径放回托管位置。独立检查网站后再切换正式环境，切勿直接覆盖现有云库。</p></li></ol>
    <p class="hint">外部平台可能缓存分享卡片；完整备份校验不会清除这些缓存。</p></section>`;
}
