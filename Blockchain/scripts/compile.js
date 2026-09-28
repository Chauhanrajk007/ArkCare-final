import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const ROOT = path.resolve(process.cwd());

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
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log("Compiling CareQuest contracts (solc " + solc.version() + ")...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

for (const warning of (output.errors || []).filter((i) => i.severity === "warning")) {
  console.warn(warning.formattedMessage);
}

const errors = (output.errors || []).filter((i) => i.severity === "error");
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}

let total = 0;
for (const [source, contracts] of Object.entries(output.contracts)) {
  // Only report our own contracts; the OpenZeppelin ones are implementation
  // detail and would bury the three that matter.
  if (!source.startsWith("contracts/")) continue;
  for (const [name, artifact] of Object.entries(contracts)) {
    const size = artifact.evm.bytecode.object.length / 2;
    total += 1;
    console.log(
      "  OK  " + source + ":" + name + "  (" + size + " bytes)"
    );
  }
}

if (!total) {
  console.error("No CareQuest contracts were produced by the compiler.");
  process.exit(1);
}

console.log("All " + total + " CareQuest contracts compiled.");
