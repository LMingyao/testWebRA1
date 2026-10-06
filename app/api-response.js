// Edge error pages and login redirects are not part of the JSON API contract.
// Keep their body out of UI messages; retain status for bounded retry decisions.
export async function readAPIResponse(response, { session = false } = {}) {
  const fail = (message, retryable = false) => {
    const error = new Error(message);
    error.status = response.status;
    error.retryable = retryable;
    throw error;
  };
  if (session && (response.status === 401 || response.redirected))
    fail('登录已过期。请保留草稿，重新登录后恢复草稿再保存。');
  const temporary = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(response.status);
  const invalid = () => {
    if (response.status === 413) fail('上传请求超过服务端大小限制。草稿仍保留，请减少本次上传数量后重试。');
    if (temporary) fail(`后台暂时未返回有效数据（HTTP ${response.status}）。草稿仍保留，请稍后重试。`, true);
    fail(`后台返回了非预期响应（HTTP ${response.status}）。请保留草稿；刷新并重新登录后恢复草稿再保存。`, response.ok);
  };
  if (response.redirected || !/^application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('Content-Type') || '')) invalid();
  let result;
  try { result = await response.json(); } catch { invalid(); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) invalid();
  if (!response.ok) fail(typeof result.error === 'string' ? result.error : `后台请求失败（HTTP ${response.status}）。请保留草稿。`, temporary);
  return result;
}
