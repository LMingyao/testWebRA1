import { contentImagePaths, validateContent } from '../app/shared.js';
import { publishedContent, publicationFiles, renderPublishedPage } from '../app/publishing.js';
import { github, commitFiles } from './github.js';
import { HTTPError } from './media.js';
import { MEDIA_PATH } from '../app/media-policy.js';

export async function listHistory(env) {
  const row=await env.DB.prepare("SELECT json_group_array(json_object('sequence', sequence, 'revision', revision, 'saved_at', saved_at, 'name', json_extract(document,'$.site.name'))) AS items FROM (SELECT * FROM gallery_history ORDER BY sequence DESC LIMIT 20)").first();
  return {entries:JSON.parse(row.items)};
}
export async function historyEntry(env, sequence) {
  const row=await env.DB.prepare('SELECT document, revision FROM gallery_history WHERE sequence = ?').bind(sequence).first();
  if (!row) throw new HTTPError(404,'该历史记录已不存在。');
  return {data:validateContent(JSON.parse(row.document)),revision:row.revision};
}
export async function backupManifest(env) {
  const current=await env.DB.prepare('SELECT document, revision, updated_at FROM gallery_content WHERE id = 1').first();
  const media=await env.DB.prepare("SELECT json_group_array(json_object('path',path,'digest',digest,'bytes',bytes,'created_at',created_at)) AS items FROM gallery_media").first();
  const history=await env.DB.prepare("SELECT json_group_array(json_object('revision',revision,'data',json(document),'savedAt',saved_at)) AS items FROM (SELECT * FROM gallery_history ORDER BY sequence DESC LIMIT 20)").first();
  return {format:'gallery-backup-v1',createdAt:new Date().toISOString(),revision:current.revision,
    data:JSON.parse(current.document),history:JSON.parse(history.items),media:JSON.parse(media.items),mediaBase:env.MEDIA_BASE};
}
export async function mediaReport(env, fetcher = fetch) {
  const backup=await backupManifest(env), used=new Set(contentImagePaths(backup.data));
  for (const item of backup.history) for (const path of contentImagePaths(item.data)) used.add(path);
  const unused=backup.media.filter(item=>!used.has(item.path)), registered=new Set(backup.media.map(item=>item.path));
  let repositoryChecked=false, note='仅检查已登记媒体；未执行任何删除。';
  if (env.GITHUB_TOKEN) {
    try {
      const tree=await github(env,`git/trees/${encodeURIComponent(env.GITHUB_BRANCH)}?recursive=1`,'GET',undefined,fetcher);
      for (const file of tree.tree || []) if (file.type==='blob' && MEDIA_PATH.test(file.path) && !used.has(file.path) && !registered.has(file.path))
        unused.push({path:file.path,bytes:file.size,unregistered:true});
      repositoryChecked=!tree.truncated;
      note=tree.truncated?'仓库目录过大，结果不完整；请用完整备份工具核对。':'已检查登记媒体及仓库中的未登记上传文件；未执行任何删除。';
    } catch { note='仓库扫描未完成，仅列出已登记媒体；请检查上传凭据后重试。'; }
  }
  return {unused,mediaCount:backup.media.length,repositoryChecked,note};
}
export async function health(env, fetcher) {
  const row=await env.DB.prepare('SELECT document, revision, updated_at FROM gallery_content WHERE id = 1').first();
  const count=await env.DB.prepare('SELECT count(*) AS n FROM gallery_media').first();
  let publication=await env.DB.prepare('SELECT revision,status,commit_sha,message FROM gallery_publication WHERE id = 1').first();
  let upload={ok:false,message:'尚未配置上传令牌。'};
  if (env.GITHUB_TOKEN) {
    try { await github(env,`git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`,'GET',undefined,fetcher);
      upload={ok:true,message:'仓库连接有效；写入权限将在上传时验证。'};
    } catch (error) { upload.message=error.message; }
  }
  const mediaPreview={ok:false,message:'未完成照片读取抽查。'};
  if (row) {
    try {
      const document=validateContent(JSON.parse(row.document)), photo=publishedContent(document).photos[0];
      const response=await fetcher(new URL(photo?.display || photo?.image || document.site.aboutImage,env.MEDIA_BASE),{method:'HEAD',signal:AbortSignal.timeout(10000)});
      mediaPreview.ok=response.ok;mediaPreview.message=response.ok?'抽查的一张照片可以公开读取。':'抽查照片读取失败，请检查图片托管。';
    } catch { mediaPreview.message='照片读取检查未完成，请稍后重试。'; }
  }
  if (publication?.status==='submitted' && publication.revision===row?.revision) {
    try {
      const deployed=await fetcher(new URL('/content/publication.json',env.SITE_ORIGIN),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
      if (deployed.ok && (await deployed.json()).revision===row.revision) publication={...publication,status:'published',message:'正式页面的发布版本已同步。'};
    } catch { /* Submission is not evidence of completed deployment. */ }
  }
  return {database:Boolean(row),updatedAt:row?.updated_at,mediaCount:count.n,upload,mediaPreview,
    publication:publication?.revision===row?.revision?publication:{status:'pending',message:'当前内容尚未同步到静态网站与分享信息。'}};
}
export async function publish(env, fetcher) {
  const owner=crypto.randomUUID(), now=Math.floor(Date.now()/1000);
  const lock=await env.DB.prepare('INSERT INTO gallery_publish_lock(id,owner,expires_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at < ? RETURNING owner').bind(owner,now+180,now).first();
  if (lock?.owner!==owner) return {status:'pending',message:'已有同步任务进行中，请稍后重试。'};
  let row;
  try {
    row=await env.DB.prepare('SELECT document, revision FROM gallery_content WHERE id = 1').first();
    if (!row) throw new HTTPError(503,'没有可发布内容。');
    const current=await env.DB.prepare('SELECT revision,status,message FROM gallery_publication WHERE id = 1').first();
    if (current?.revision===row.revision && current.status==='submitted') return current;
    const asset=await env.ASSETS.fetch(new Request('https://assets.internal/public-shell.html'));
    if (!asset.ok) throw new HTTPError(503,'发布模板尚未部署。');
    const data=publishedContent(validateContent(JSON.parse(row.document)));
    // Only the public document is allowed into public HTML; drafts never leave D1.
    const template=await asset.text(), files=publicationFiles(template,data,row.revision);
    const sourceDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const manifest=files.find(file=>file.path==='content/publication.json');
    manifest.content=JSON.stringify({...JSON.parse(manifest.content),sourceDigest})+'\n';
    files.push({path:"content/gallery.json",content:JSON.stringify(data,null,2)+"\n"});
    // Keep existing entry paths alive after category removal, with noindex notices.
    const older=await env.DB.prepare("SELECT json_group_array(json(document)) AS items FROM gallery_history").first();
    const previous=JSON.parse(older.items), paths=new Set(files.map(f=>f.path));
    for (const record of previous) for (const category of record.categories) {
      const file=`collection-${category.id}.html`;
      if (['aviation','landscape','portrait','wildlife','motorsport'].includes(category.id)||paths.has(file)) continue;
      files.push({path:file,content:renderPublishedPage(template,data,'portfolio',category.id)});paths.add(file);
    }
    const sha=await commitFiles(env,files,'Publish current photography pages and metadata',fetcher,async()=>{
      const latest=await env.DB.prepare('SELECT revision FROM gallery_content WHERE id = 1').first();
      if (latest.revision!==row.revision) throw new HTTPError(409,'内容再次更新，请同步最新版本。');
      const lease=await env.DB.prepare('SELECT owner,expires_at FROM gallery_publish_lock WHERE id=1').first();
      if (lease?.owner!==owner || lease.expires_at<=Math.floor(Date.now()/1000)) throw new HTTPError(409,'同步任务已过期，请重新同步最新版本。');
    });
    const message='静态页面与分享信息已提交，等待 GitHub Pages 部署；新访客读取的云端内容已更新。';
    await env.DB.prepare('INSERT INTO gallery_publication(id,revision,status,commit_sha,message) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,status=excluded.status,commit_sha=excluded.commit_sha,message=excluded.message,updated_at=CURRENT_TIMESTAMP').bind(row.revision,'submitted',sha,message).run();
    return {status:'submitted',revision:row.revision,message};
  } catch (error) {
    const message=error instanceof HTTPError?error.message:'静态同步失败；云端内容已保存，可在运行维护中重试。';
    if (row) await env.DB.prepare('INSERT INTO gallery_publication(id,revision,status,message) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,status=excluded.status,message=excluded.message,updated_at=CURRENT_TIMESTAMP').bind(row.revision,error.status===409?'pending':'failed',message).run();
    return {status:error.status===409?'pending':'failed',message};
  } finally { await env.DB.prepare('DELETE FROM gallery_publish_lock WHERE id=1 AND owner=?').bind(owner).run(); }
}
