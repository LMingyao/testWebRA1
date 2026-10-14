export function publicationLabel(result, expected) {
  if (result.revision !== expected) return {state:"changed", text:"云端已有新版本；当前编辑尚未合并，请保留草稿并重新连接。"};
  if (result.publication.status === "published") return {state:"complete", text:"全部完成 · 内容、正式页面与分享信息已同步"};
  if (result.publication.status === "failed") return {state:"failed", text:"内容已保存 · 分享信息同步失败，可在运行维护中重试"};
  return {state:"pending", text:result.publication.status === "submitted" ? "内容已保存 · 正式页面与分享信息部署中" : "内容已保存 · 静态页面与分享信息尚未同步"};
}
// One bounded foreground monitor per saved revision. An older response cannot replace a new save's status.
export function createPublicationMonitor(element, timers = globalThis) {
  let generation = 0, timer, draft = false, latest;
  const render = () => {
    if (!latest) return;
    const {state, text} = latest;
    element.hidden = false; element.dataset.state = state;
    element.textContent = draft && ["complete", "pending", "failed", "local"].includes(state)
      ? (state === "complete" ? "上次保存已完成同步" : state === "failed" ? "上次保存的静态同步失败" : state === "local" ? "本机保存与正式发布是不同步骤" : "上次保存的静态发布尚未完成") + " · 当前更改尚未保存"
      : text;
  };
  const show = (state, text) => { latest = {state,text}; render(); };
  const stop = () => { generation++; timers.clearTimeout(timer); };
  const start = (store, revision, publication) => {
    stop(); latest = undefined; const current = generation;
    if (store.mode !== "d1") { show("local", store.mode === "local" ? "本机内容已保存 · 正式发布另行进行" : "已提交内容 · 等待网站部署"); return; }
    if (publication) {
      const label = publicationLabel({revision,publication}, revision); show(label.state,label.text);
    } else { element.hidden = true; }
    let attempts = 0;
    const check = async () => {
      if (current !== generation) return;
      try {
        const result = await store.request("publication");
        if (current !== generation) return;
        const label = publicationLabel(result,revision); show(label.state,label.text);
        if (["complete", "changed", "failed"].includes(label.state)) return;
      } catch {
        if (current !== generation) return;
        show("unknown", "发布状态暂时无法确认 · 内容与草稿不会因此丢失");
      }
      if (++attempts < 20) timer = timers.setTimeout(check,15000);
      else show("pending", "内容已保存 · 静态发布尚未确认，请到运行维护查看最新状态");
    };
    timer = timers.setTimeout(check,publication ? 3000 : 0);
  };
  return {start, stop, draft:changed => { draft = Boolean(changed); render(); }, saving:() => { stop(); show("saving","正在保存内容与照片…"); },
    unconfirmed:() => show("unknown","保存结果尚未确认 · 草稿保留，请检查提示后重试")};
}
