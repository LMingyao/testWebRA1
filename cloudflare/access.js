const encoder = new TextEncoder();
const keySets = new Map();
function decode(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
export async function administrator(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  // This bypass cannot work on a deployed workers.dev or custom hostname.
  if (env.LOCAL_DEV === "1" && ["127.0.0.1", "localhost"].includes(url.hostname))
    return "local-development";
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || "") ||
      !env.ACCESS_AUD || !env.ADMIN_EMAILS) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16000) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    const allowed = env.ADMIN_EMAILS.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` ||
        !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        typeof claims.sub !== "string" || !claims.sub ||
        typeof claims.email !== "string" || !allowed.includes(claims.email.toLowerCase())) return null;
    let cached = keySets.get(env.ACCESS_TEAM_DOMAIN);
    if (!cached || cached.expires < Date.now() || !cached.keys.some(key => key.kid === header.kid)) {
      const response = await fetcher(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, {
        redirect: "error", signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!Array.isArray(result.keys)) return null;
      cached = { keys: result.keys, expires: Date.now() + 3600000 };
      keySets.set(env.ACCESS_TEAM_DOMAIN, cached);
    }
    const jwk = cached.keys.find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`)) ? claims.email : null;
  } catch {
    return null;
  }
}
