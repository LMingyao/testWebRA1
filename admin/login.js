import { derivePassword, encode64, PASSWORD_ITERATIONS } from "../app/password.js";
import { readAPIResponse } from "../app/api-response.js";

const form = document.querySelector("#password-form");
const status = document.querySelector("#login-status");
const button = form.querySelector("button");
let config;
try {
  const session = await fetch("/api/admin/session", { cache: "no-store" });
  if (session.ok) location.replace("/admin/");
  else {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    const data = await readAPIResponse(response);
    if (data.iterations !== PASSWORD_ITERATIONS) throw new Error("登录设置已更新，请刷新页面。");
    config = data;
    status.textContent = "";
    button.disabled = false;
  }
} catch (error) {
  status.textContent = error.message || "连接失败，请稍后刷新。";
  status.dataset.error = "true";
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!config || button.disabled) return;
  button.disabled = true;
  status.dataset.error = "false";
  status.textContent = "正在登录…";
  let password = form.elements.password.value;
  form.elements.password.value = "";
  try {
    // The expensive password derivation runs on the owner's device, keeping the
    // server within Workers Free's CPU budget. The proof is a TLS-only credential.
    const proof = await derivePassword(password, config.salt);
    password = "";
    const response = await fetch("/api/auth/login", { method: "POST", cache: "no-store", headers: {
      "Content-Type": "application/json", "X-Gallery-Request": "admin",
    }, body: JSON.stringify({ proof: encode64(proof) }) });
    proof.fill(0);
    await readAPIResponse(response);
    location.replace("/admin/");
  } catch (error) {
    status.textContent = error.message || "登录失败，请稍后重试。";
    status.dataset.error = "true";
    form.elements.password.focus();
  } finally { password = ""; button.disabled = false; }
});
