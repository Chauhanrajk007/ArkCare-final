import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

// An explicit argument wins, then MST_RPC_URL, then the deployed RPC recorded in
// runtime/deployment.json.
const url =
  process.argv[2] ||
  process.env.MST_RPC_URL ||
  JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "deployment.json"), "utf8")).rpcUrl;

const attempts = Number(process.env.RPC_WAIT_ATTEMPTS || 40);
const delayMs = Number(process.env.RPC_WAIT_DELAY_MS || 750);

console.log("Waiting for RPC:", url);

for (let attempt = 0; attempt < attempts; attempt += 1) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const body = await response.json();
      console.log("RPC ready - chainId", body?.result);
      process.exit(0);
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

console.error("Timed out waiting for RPC:", url);
process.exit(1);
