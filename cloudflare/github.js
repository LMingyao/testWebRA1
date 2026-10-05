import { HTTPError } from './media.js';
export async function github(env, endpoint, method = 'GET', body, fetcher = fetch) {
  if (!env.GITHUB_TOKEN || env.GITHUB_REPO !== 'LMingyao/testWebRA1' ||
      !/^[a-zA-Z0-9_./-]+$/.test(env.GITHUB_BRANCH || '') || env.GITHUB_BRANCH.includes('..'))
    throw new HTTPError(503, '未配置有效的照片仓库。');
  const response = await fetcher(`https://api.github.com/repos/${env.GITHUB_REPO}/${endpoint}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: {Authorization:`Bearer ${env.GITHUB_TOKEN}`, Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'Mingyao-Gallery', 'Content-Type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  if (!response.ok) throw new HTTPError(response.status === 404 ? 404 : response.status === 409 || response.status === 422 ? 409 : 502,
    response.status === 401 || response.status === 403 ? '仓库凭据已失效或权限不足，请更新上传令牌。' : '仓库请求失败，请稍后重试。');
  return response.json();
}
export async function commitFiles(env, files, message, fetcher = fetch, beforeCommit = () => {}) {
  const branch = encodeURIComponent(env.GITHUB_BRANCH);
  const ref = await github(env, `git/ref/heads/${branch}`, 'GET', undefined, fetcher);
  const parent = await github(env, `git/commits/${ref.object.sha}`, 'GET', undefined, fetcher);
  const tree = [];
  for (const file of files) {
    if (file.base64 !== undefined) {
      const blob = await github(env, 'git/blobs', 'POST', {content:file.base64, encoding:'base64'}, fetcher);
      tree.push({path:file.path, mode:'100644', type:'blob', sha:blob.sha});
    } else tree.push({path:file.path, mode:'100644', type:'blob', content:file.content});
  }
  const next = await github(env, 'git/trees', 'POST', {base_tree:parent.tree.sha,tree}, fetcher);
  const commit = await github(env, 'git/commits', 'POST', {message,tree:next.sha,parents:[ref.object.sha]}, fetcher);
  await beforeCommit();
  await github(env, `git/refs/heads/${branch}`, 'PATCH', {sha:commit.sha,force:false}, fetcher);
  return commit.sha;
}
