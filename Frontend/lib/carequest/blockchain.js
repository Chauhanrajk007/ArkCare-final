const DEFAULT_BRIDGE = "http://127.0.0.1:8546";

// An anchor is a write that the bridge only resolves once the transaction is
// confirmed in a block. The MST testnet produces a block roughly every 3s, so
// cap the wait well above one block while still failing fast instead of leaving
// the calling request (and its database write) hanging indefinitely.
const READ_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 45000;

function bridgeUrl(path) {
  return (process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_URL || DEFAULT_BRIDGE).replace(/\/$/, "") + path;
}

// Set only when the bridge runs as a hosted service (Render, etc.) rather than
// on this machine. Locally the bridge is loopback-only and needs no token.
function bridgeHeaders() {
  const token = process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN;
  return token ? { "x-bridge-token": token } : {};
}

export function blockchainEnabled() {
  return process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true";
}

async function callBridge(path, body) {
  if (!blockchainEnabled()) {
    return { disabled: true };
  }

  const response = await fetch(bridgeUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bridgeHeaders() },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Blockchain bridge request failed");
  return data;
}

export async function mintCapsules({ walletAddress, amount, reference }) {
  return callBridge("/mint", { walletAddress, amount, reference });
}

export async function getBlockchainBalance(walletAddress) {
  if (!blockchainEnabled()) return { disabled: true, balance: null };
  const response = await fetch(
    bridgeUrl("/balance?walletAddress=" + encodeURIComponent(walletAddress)),
    { cache: "no-store", headers: bridgeHeaders(), signal: AbortSignal.timeout(READ_TIMEOUT_MS) }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not read blockchain balance");
  return data;
}

export async function anchorAuditRoot({ batchId, merkleRoot }) {
  return callBridge("/anchor", { batchId, merkleRoot });
}

export async function blockchainHealth() {
  try {
    const response = await fetch(bridgeUrl("/health"), {
      cache: "no-store",
      headers: bridgeHeaders(),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, ...data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
