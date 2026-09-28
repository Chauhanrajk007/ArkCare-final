/**
 * Stateless session tokens: HMAC-SHA256 signed JSON in an httpOnly cookie.
 *
 * Deliberately edge-safe (Web Crypto only, no Node builtins, no mongoose) so the
 * exact same signing/verification code runs in `middleware.js`, in server
 * actions, and in the socket.io handshake.
 */

export const SESSION_COOKIE = "sc_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const DEV_FALLBACK_SECRET = "arkcare-dev-insecure-secret";

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 16 characters. Generate one with " +
        "`openssl rand -base64 32` and set it in .env.local."
    );
  }

  if (!secret) {
    console.warn(
      "[auth] AUTH_SECRET is not set — using an insecure development secret. " +
        "Set AUTH_SECRET in .env.local before deploying."
    );
  }

  return secret && secret.length ? secret : DEV_FALLBACK_SECRET;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBinary(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 ? "=".repeat(4 - (padded.length % 4)) : "";

  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64UrlDecodeToString(value) {
  return decoder.decode(base64UrlToBinary(value));
}

async function importSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Sign a session payload. `payload` must contain `sub` (the user id). */
export async function signSessionToken(payload, maxAge = SESSION_MAX_AGE) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + maxAge,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const key = await importSigningKey(getSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload)
  );

  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a token's signature and expiry.
 * @returns {Promise<null | { sub: string, role: string | null, email: string, name: string, iat: number, exp: number }>}
 */
export async function verifySessionToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;

  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await importSigningKey(getSecret());
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      // The signature is raw binary, so decode to bytes — not to a string.
      base64UrlToBinary(encodedSignature),
      encoder.encode(encodedPayload)
    );

    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));

    if (!payload || typeof payload.sub !== "string" || !payload.sub) {
      return null;
    }

    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/** Serialized `Set-Cookie` value that installs the session cookie. */
export function serializeSessionCookie(token, maxAge = SESSION_MAX_AGE) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (process.env.NODE_ENV === "production") parts.push("Secure");

  return parts.join("; ");
}

/** Serialized `Set-Cookie` value that removes the session cookie. */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}
