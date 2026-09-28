import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ethers } from "ethers";

const ROOT = path.resolve(process.cwd());
const RUNTIME = path.join(ROOT, "runtime");
const deploymentPath = path.join(RUNTIME, "deployment.json");
const statePath = path.join(RUNTIME, "bridge-state.json");

// A hosted container (Render, Fly, etc.) assigns the port through $PORT and
// expects the process to listen on 0.0.0.0. Locally there is no $PORT, so the
// loopback default stands and the bridge is never reachable off-box.
const bridgePort = Number(
  process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_PORT || process.env.PORT || 8546
);
if (!Number.isInteger(bridgePort) || bridgePort < 1024 || bridgePort > 65535) {
  throw new Error(
    "CAREQUEST_BLOCKCHAIN_BRIDGE_PORT (or PORT) must be a valid TCP port"
  );
}
const BRIDGE_HOST = process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_HOST || "127.0.0.1";
const isHosted = BRIDGE_HOST === "0.0.0.0";

if (isHosted) {
  // The bridge is the only process that can sign, and it mints to whatever
  // wallet address it is handed. On a shared network that has to be locked
  // down, so require an explicit shared secret from the caller.
  if (!process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN) {
    throw new Error(
      "CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN is required when the bridge binds " +
        "0.0.0.0. The Next.js server must send it as x-bridge-token."
    );
  }
  console.warn(
    "[SECURITY] Bridge is bound to 0.0.0.0 and signs transactions. It must " +
      "only be reachable from the app service - do not expose it publicly."
  );
}

if (!fs.existsSync(deploymentPath)) {
  throw new Error("Run deployment before starting the CareQuest bridge");
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, "..", "arkcare.env"));
loadEnvFile(path.join(ROOT, ".env"));

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const provider = new ethers.JsonRpcProvider(deployment.rpcUrl);

// A public RPC exposes *other* accounts (validators, node keys) via
// eth_accounts, and cannot sign for them. getSigner(0) therefore yields an
// unfunded account with no contract roles, so every tx fails, and the BridgeKey
// wallet is the only way to sign.
const privateKey = (
  process.env.BRIDGEKEY_PRIVATE_KEY ||
  process.env.MST_PRIVATE_KEY ||
  ""
).trim();

// Block explorer for the network. Overridable so a different testnet can be
// pointed at without touching the frontend.
const EXPLORER_URL = (
  process.env.CAREQUEST_BLOCKCHAIN_EXPLORER_URL || "https://testnet.mstscan.com"
).replace(/\/$/, "");

// The bridge is the only signer, so it is deliberately the one place that reads
// the key: it binds to 127.0.0.1, is never tunnelled, and the frontend posts to
// it server-side. Deploy and bridge must therefore agree on the key - the
// contracts grant their roles to whoever deployed with it.
if (!privateKey) {
  throw new Error(
    "BRIDGEKEY_PRIVATE_KEY is required. The public MST RPC cannot sign for the " +
      "accounts it lists, so the bridge must hold the key that owns the " +
      "contract roles. Set it in arkcare.env."
  );
}
const signer = new ethers.Wallet(privateKey, provider);
const capsule = new ethers.Contract(
  deployment.capsuleAddress,
  deployment.capsuleAbi,
  signer
);
const audit = new ethers.Contract(
  deployment.auditAddress,
  deployment.auditAbi,
  signer
);
const hospitalCapsule = deployment.hospitalCapsuleAddress
  ? new ethers.Contract(
      deployment.hospitalCapsuleAddress,
      deployment.hospitalCapsuleAbi,
      signer
    )
  : null;

function loadState() {
  if (!fs.existsSync(statePath)) return { references: {} };
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { references: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// The app origin, used for the (rare) browser-side CORS case. Server actions
// call the bridge from Node, where CORS does not apply.
const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

const BRIDGE_TOKEN = (process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN || "").trim();

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
  });
  response.end(JSON.stringify(body));
}

/**
 * When the bridge is hosted it is a network service holding a signing key, so
 * every request must carry the shared secret. A missing or wrong token is
 * rejected before any transaction is built.
 */
function authorized(request) {
  if (!isHosted) return true;
  if (!BRIDGE_TOKEN) return false;
  const sent = request.headers["x-bridge-token"];
  const a = Buffer.from(String(sent || ""));
  const b = Buffer.from(BRIDGE_TOKEN);
  // Constant-time compare; length check first because timingSafeEqual throws
  // on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// A public RPC returns only its own node/validator accounts through
// eth_accounts, and may expose fewer than two, so borrowing one of those for a
// patient is unreliable (and the RPC cannot sign for it anyway). Derive a
// stable per-patient receive address from the BridgeKey seed instead: the same
// patient id always yields the same address, and the bridge holds the parent key
// that can fund it.
const hdRoot = ethers.HDNodeWallet.fromSeed(
  new Uint8Array(ethers.getBytes(privateKey).slice(1))
);

function patientWallet(reference) {
  const seedInt = BigInt(
    "0x" + crypto.createHash("sha256").update(String(reference)).digest("hex")
  );
  const index = (seedInt % 1000000n).toString();
  return hdRoot.derivePath(`m/44'/60'/0'/0/${index}`).address;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(
      request.url,
      "http://" + BRIDGE_HOST + ":" + bridgePort
    );

    // /health stays open so a platform healthcheck and the audit console can
    // read the chain status; every other route needs the shared token because
    // it can move tokens.
    const isHealth = request.method === "GET" && url.pathname === "/health";
    if (!isHealth && !authorized(request)) {
      return json(response, 401, { error: "invalid or missing bridge token" });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const blockNumber = await provider.getBlockNumber();
      return json(response, 200, {
        ok: true,
        network: deployment.network,
        chainId: deployment.chainId,
        blockNumber,
        signerAddress: await signer.getAddress(),
        // The audit console links each anchor batch's tx hash to this.
        explorer: EXPLORER_URL,
        capsuleAddress: deployment.capsuleAddress,
        hospitalCapsuleAddress: deployment.hospitalCapsuleAddress || null,
        auditAddress: deployment.auditAddress,
      });
    }

    if (request.method === "POST" && url.pathname === "/wallet") {
      const payload = await body(request);
      if (!payload.reference) return json(response, 400, { error: "reference required" });
      const walletAddress = patientWallet(payload.reference);
      if (!ethers.isAddress(walletAddress || "")) {
        return json(response, 503, { error: "no wallet could be assigned for this network" });
      }
      return json(response, 200, {
        walletAddress,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "GET" && url.pathname === "/balance") {
      const walletAddress = url.searchParams.get("walletAddress");
      if (!ethers.isAddress(walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      const balance = await capsule.balanceOf(walletAddress);
      return json(response, 200, {
        walletAddress,
        balance: Number(balance),
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "POST" && url.pathname === "/mint") {
      const payload = await body(request);
      if (!ethers.isAddress(payload.walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      const amount = Number(payload.amount);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
        return json(response, 400, { error: "positive integer amount required" });
      }
      if (!payload.reference) return json(response, 400, { error: "reference required" });

      const state = loadState();
      if (state.references[payload.reference]) {
        return json(response, 200, {
          duplicate: true,
          txHash: state.references[payload.reference],
        });
      }

      const tx = await capsule.mint(payload.walletAddress, amount);
      const receipt = await tx.wait();
      state.references[payload.reference] = receipt.hash;
      saveState(state);
      return json(response, 200, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        amount,
        walletAddress: payload.walletAddress,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "POST" && url.pathname === "/burn") {
      const payload = await body(request);
      if (!ethers.isAddress(payload.walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      const amount = Number(payload.amount);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
        return json(response, 400, { error: "positive integer amount required" });
      }
      if (!payload.reference) return json(response, 400, { error: "reference required" });

      const state = loadState();
      if (state.references[payload.reference]) {
        return json(response, 200, {
          duplicate: true,
          txHash: state.references[payload.reference],
        });
      }

      const tx = await capsule.correctionBurn(payload.walletAddress, amount);
      const receipt = await tx.wait();
      state.references[payload.reference] = receipt.hash;
      saveState(state);
      return json(response, 200, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        amount,
        walletAddress: payload.walletAddress,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "GET" && url.pathname === "/hospital-balance") {
      if (!hospitalCapsule) {
        return json(response, 503, { error: "hospital Capsule contract not deployed" });
      }
      const walletAddress = url.searchParams.get("walletAddress");
      const tokenId = Number(url.searchParams.get("tokenId"));
      if (!ethers.isAddress(walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      if (!Number.isInteger(tokenId) || tokenId <= 0) {
        return json(response, 400, { error: "positive integer tokenId required" });
      }
      const balance = await hospitalCapsule.balanceOf(walletAddress, tokenId);
      return json(response, 200, {
        walletAddress,
        tokenId,
        balance: Number(balance),
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "POST" && url.pathname === "/hospital-mint") {
      if (!hospitalCapsule) {
        return json(response, 503, { error: "hospital Capsule contract not deployed" });
      }
      const payload = await body(request);
      const tokenId = Number(payload.tokenId);
      const amount = Number(payload.amount);
      if (!ethers.isAddress(payload.walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      if (!Number.isInteger(tokenId) || tokenId <= 0) {
        return json(response, 400, { error: "positive integer tokenId required" });
      }
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
        return json(response, 400, { error: "positive integer amount required" });
      }
      if (!payload.reference) return json(response, 400, { error: "reference required" });

      const state = loadState();
      const key = "hospital-mint:" + payload.reference;
      if (state.references[key]) {
        return json(response, 200, {
          duplicate: true,
          txHash: state.references[key],
          tokenId,
        });
      }

      const tx = await hospitalCapsule.mint(payload.walletAddress, tokenId, amount);
      const receipt = await tx.wait();
      state.references[key] = receipt.hash;
      saveState(state);
      return json(response, 200, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenId,
        amount,
        walletAddress: payload.walletAddress,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "POST" && url.pathname === "/hospital-burn") {
      if (!hospitalCapsule) {
        return json(response, 503, { error: "hospital Capsule contract not deployed" });
      }
      const payload = await body(request);
      const tokenId = Number(payload.tokenId);
      const amount = Number(payload.amount);
      if (!ethers.isAddress(payload.walletAddress || "")) {
        return json(response, 400, { error: "valid walletAddress required" });
      }
      if (!Number.isInteger(tokenId) || tokenId <= 0) {
        return json(response, 400, { error: "positive integer tokenId required" });
      }
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
        return json(response, 400, { error: "positive integer amount required" });
      }
      if (!payload.reference) return json(response, 400, { error: "reference required" });

      const state = loadState();
      const key = "hospital-burn:" + payload.reference;
      if (state.references[key]) {
        return json(response, 200, {
          duplicate: true,
          txHash: state.references[key],
          tokenId,
        });
      }

      const tx = await hospitalCapsule.correctionBurn(
        payload.walletAddress,
        tokenId,
        amount
      );
      const receipt = await tx.wait();
      state.references[key] = receipt.hash;
      saveState(state);
      return json(response, 200, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenId,
        amount,
        walletAddress: payload.walletAddress,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    if (request.method === "POST" && url.pathname === "/anchor") {
      const payload = await body(request);
      if (!payload.batchId || !/^0x[0-9a-fA-F]{64}$/.test(payload.merkleRoot || "")) {
        return json(response, 400, { error: "batchId and bytes32 merkleRoot required" });
      }
      const batchKey = "anchor:" + payload.batchId;
      const state = loadState();
      if (state.references[batchKey]) {
        return json(response, 200, {
          duplicate: true,
          txHash: state.references[batchKey],
          network: deployment.network,
          chainId: deployment.chainId,
        });
      }

      const batchId = ethers.id(payload.batchId);
      const tx = await audit.anchor(batchId, payload.merkleRoot);
      const receipt = await tx.wait();
      state.references[batchKey] = receipt.hash;
      saveState(state);
      return json(response, 200, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        network: deployment.network,
        chainId: deployment.chainId,
      });
    }

    return json(response, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: error.message });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error("Port " + bridgePort + " is already in use - another bridge is running.");
    console.error("Stop it, then start this one:");
    console.error("  Get-NetTCPConnection -LocalPort " + bridgePort + " -State Listen");
    console.error("  Stop-Process -Id <pid> -Force");
    console.error("Or use a different port via CAREQUEST_BLOCKCHAIN_BRIDGE_PORT.");
    process.exit(1);
  }
  throw error;
});

server.listen(bridgePort, BRIDGE_HOST, async () => {
  const signerAddress = await signer.getAddress();
  const balance = await provider.getBalance(signerAddress);
  const ANCHOR_ROLE = ethers.id("ANCHOR_ROLE");

  console.log("");
  console.log("CareQuest blockchain bridge ONLINE");
  console.log("Bridge: http://" + BRIDGE_HOST + ":" + bridgePort);
  console.log("Network:", deployment.network);
  console.log("Chain ID:", deployment.chainId);
  console.log("Signer:", signerAddress);
  console.log("Balance:", ethers.formatEther(balance), "tMSTC");
  console.log("Legacy CAP:", deployment.capsuleAddress);
  console.log("Hospital Capsules:", deployment.hospitalCapsuleAddress || "not deployed");
  console.log("Audit:", deployment.auditAddress);
  console.log("Explorer:", EXPLORER_URL);

  if (balance === 0n) {
    console.warn("");
    console.warn("[WARNING] Signer holds 0 tokens - transactions will revert.");
    console.warn("Claim testnet tokens from: https://faucet.masterstroke.academy");
  }

  const canAnchor = await audit.hasRole(ANCHOR_ROLE, signerAddress);
  if (!canAnchor) {
    console.warn("");
    console.warn("[WARNING] Signer lacks ANCHOR_ROLE - /anchor will revert.");
    console.warn("Grant it from the admin wallet:", deployment.admin);
  }
});
