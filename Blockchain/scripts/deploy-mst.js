import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { ethers } from "ethers";

const ROOT = path.resolve(process.cwd());
const RUNTIME = path.join(ROOT, "runtime");
fs.mkdirSync(RUNTIME, { recursive: true });

// Load environment variables without external dotenv package
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFile(path.join(ROOT, "../arkcare.env"));
loadEnvFile(path.join(ROOT, ".env"));

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function findImports(importPath) {
  const candidates = [
    path.join(ROOT, importPath),
    path.join(ROOT, "node_modules", importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: "Import not found: " + importPath };
}

const input = {
  language: "Solidity",
  sources: {
    "contracts/CareQuestCapsule.sol": {
      content: read("contracts/CareQuestCapsule.sol"),
    },
    "contracts/CareQuestAuditAnchor.sol": {
      content: read("contracts/CareQuestAuditAnchor.sol"),
    },
    "contracts/CareQuestHospitalCapsules.sol": {
      content: read("contracts/CareQuestHospitalCapsules.sol"),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

console.log("Compiling smart contracts for MST Blockchain...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors || []).filter((item) => item.severity === "error");
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}

function artifact(source, name) {
  const item = output.contracts[source][name];
  return {
    abi: item.abi,
    bytecode: "0x" + item.evm.bytecode.object,
  };
}

const capsuleArtifact = artifact("contracts/CareQuestCapsule.sol", "CareQuestCapsule");
const auditArtifact = artifact("contracts/CareQuestAuditAnchor.sol", "CareQuestAuditAnchor");
const hospitalCapsuleArtifact = artifact("contracts/CareQuestHospitalCapsules.sol", "CareQuestHospitalCapsules");

// MST Testnet Configuration
const rpcUrl = process.env.MST_RPC_URL || process.env.CAREQUEST_EVM_RPC_URL || "https://rpc.mstblockchain.com";
const privateKey = process.env.BRIDGEKEY_PRIVATE_KEY || process.env.MST_PRIVATE_KEY;

if (!privateKey) {
  console.error("\n[ERROR] Missing BRIDGEKEY_PRIVATE_KEY in arkcare.env!");
  console.error("Please export your private key from BridgeKey Wallet and add it to arkcare.env:\n");
  console.error("BRIDGEKEY_PRIVATE_KEY=your_private_key_here\n");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const signer = new ethers.Wallet(privateKey.trim(), provider);
const admin = await signer.getAddress();

console.log("\n========================================================");
console.log("🚀 Deploying ArkCare to MST Blockchain Testnet");
console.log("========================================================");
console.log("RPC URL:           ", rpcUrl);
console.log("Deployer Address:  ", admin);

const balance = await provider.getBalance(admin);
console.log("Deployer Balance:  ", ethers.formatEther(balance), "$MSTC");

if (balance === 0n) {
  console.error("\n[WARNING] Your BridgeKey wallet has 0 $MSTC!");
  console.error("Please claim free testnet tokens from: https://faucet.masterstroke.academy");
  process.exit(1);
}

console.log("\n1. Deploying CareQuestCapsule (CAP)...");
const capsuleFactory = new ethers.ContractFactory(capsuleArtifact.abi, capsuleArtifact.bytecode, signer);
const capsule = await capsuleFactory.deploy(admin);
await capsule.waitForDeployment();
const capsuleAddress = await capsule.getAddress();
const capsuleTx = capsule.deploymentTransaction();
console.log("   ✔ Deployed to: ", capsuleAddress);
console.log("   ✔ Tx Hash:     ", capsuleTx?.hash);

console.log("\n2. Deploying CareQuestHospitalCapsules...");
const hospitalCapsuleFactory = new ethers.ContractFactory(hospitalCapsuleArtifact.abi, hospitalCapsuleArtifact.bytecode, signer);
const hospitalCapsule = await hospitalCapsuleFactory.deploy(admin);
await hospitalCapsule.waitForDeployment();
const hospitalCapsuleAddress = await hospitalCapsule.getAddress();
console.log("   ✔ Deployed to: ", hospitalCapsuleAddress);

console.log("\n3. Deploying CareQuestAuditAnchor (Merkle Anchor)...");
const auditFactory = new ethers.ContractFactory(auditArtifact.abi, auditArtifact.bytecode, signer);
const audit = await auditFactory.deploy(admin);
await audit.waitForDeployment();
const auditAddress = await audit.getAddress();
const auditTx = audit.deploymentTransaction();
console.log("   ✔ Deployed to: ", auditAddress);
console.log("   ✔ Tx Hash:     ", auditTx?.hash);

const network = await provider.getNetwork();
const deployment = {
  network: "mst-testnet",
  chainId: Number(network.chainId),
  rpcUrl,
  admin,
  capsuleAddress,
  hospitalCapsuleAddress,
  auditAddress,
  capsuleTxHash: capsuleTx?.hash,
  auditTxHash: auditTx?.hash,
  capsuleAbi: capsuleArtifact.abi,
  hospitalCapsuleAbi: hospitalCapsuleArtifact.abi,
  auditAbi: auditArtifact.abi,
  deployedAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(RUNTIME, "deployment.json"),
  JSON.stringify(deployment, null, 2)
);

console.log("\n========================================================");
console.log("🎉 SUCCESS! Smart contracts deployed to MST Testnet");
console.log("========================================================");
console.log("📋 HACKATHON SUBMISSION DATA:");
console.log("   • Network:                 MST Testnet");
console.log("   • Audit Anchor Address:   ", auditAddress);
console.log("   • Capsule Token Address:  ", capsuleAddress);
console.log("   • Deployment Tx Hash:     ", auditTx?.hash);
console.log("   • Explorer Link:           https://mstscan.com/tx/" + auditTx?.hash);
console.log("========================================================\n");
