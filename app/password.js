export const PASSWORD_ITERATIONS = 600000;
export function encode64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function decode64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 64)
    throw new Error("Invalid credential encoding.");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
export async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256",
    salt: decode64(salt), iterations: PASSWORD_ITERATIONS }, key, 256));
}
export async function credentialMAC(pepper, bytes) {
  const key = await crypto.subtle.importKey("raw", decode64(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode64(await crypto.subtle.sign("HMAC", key, bytes));
}
