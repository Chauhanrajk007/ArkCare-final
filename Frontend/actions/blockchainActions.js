"use server";

import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import BlockchainAccount from "@/models/BlockchainAccount";
import CapsuleAward from "@/models/CapsuleAward";
import Patient from "@/models/Patient";
import { blockchainEnabled } from "@/lib/carequest/blockchain";
import { ensureDemoHospitalPrograms } from "@/lib/carequest/programs";

const BRIDGE = () =>
  (process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_URL || "http://127.0.0.1:8546").replace(/\/$/, "");

// Read calls are cheap; writes must wait for a block confirmation. The MST
// testnet produces a block every ~3s, so cap the write wait well above one
// block while still failing fast instead of hanging the request indefinitely.
const READ_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 45000;

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

// Set only when the bridge runs as a hosted service (Render, etc.). Locally the
// bridge is loopback-only and needs no token.
function bridgeHeaders() {
  const token = process.env.CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN;
  return token ? { "x-bridge-token": token } : {};
}

async function bridge(path, body) {
  const response = await fetch(BRIDGE() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bridgeHeaders() },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: timeoutSignal(WRITE_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Blockchain bridge failed");
  return data;
}

async function bridgeGet(path) {
  const response = await fetch(BRIDGE() + path, {
    cache: "no-store",
    headers: bridgeHeaders(),
    signal: timeoutSignal(READ_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Blockchain bridge failed");
  return data;
}

async function ensureAccount(user, patient) {
  let account = await BlockchainAccount.findOne({ userId: user._id.toString() });
  if (account) return account;

  const result = await bridge("/wallet", {
    reference: user._id.toString(),
  });

  account = await BlockchainAccount.create({
    userId: user._id.toString(),
    patient: patient._id,
    walletAddress: result.walletAddress,
    network: result.network || "carequest-local-evm",
    chainId: result.chainId || 31337,
  });
  return account;
}

async function ledgerBalance(patientId, programId) {
  const awards = await CapsuleAward.find({
    patient: patientId,
    program: programId,
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const balance = awards.reduce(
    (sum, award) => sum + Number(award.amount || 0),
    0
  );
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      awards
        .map(
          (award) =>
            [
              String(award._id),
              Number(award.amount || 0),
              award.eventType || "award",
            ].join(":")
        )
        .join("|")
    )
    .digest("hex");

  return {
    awards,
    balance,
    fingerprint,
  };
}

export async function syncPatientCapsulesToBlockchain() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  if (!blockchainEnabled()) return { disabled: true };

  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const account = await ensureAccount(user, patient);
  const contexts = await ensureDemoHospitalPrograms(patient);
  const results = [];

  for (const context of contexts) {
    const tokenId = Number(context.program.blockchain?.tokenId);
    if (!context.program.blockchain?.enabled || !Number.isInteger(tokenId) || tokenId <= 0) {
      continue;
    }

    const ledger = await ledgerBalance(patient._id, context.program._id);
    const current = await bridgeGet(
      "/hospital-balance?walletAddress=" +
        encodeURIComponent(account.walletAddress) +
        "&tokenId=" +
        tokenId
    );
    const chainBalance = Number(current.balance || 0);
    const delta = ledger.balance - chainBalance;
    let txHash = null;
    let operation = "noop";
    let bridgeDuplicate = false;

    if (delta > 0) {
      operation = "mint";
      const result = await bridge("/hospital-mint", {
        walletAddress: account.walletAddress,
        tokenId,
        amount: delta,
        reference:
          "program-ledger-mint:" +
          user._id.toString() +
          ":" +
          context.program._id.toString() +
          ":" +
          ledger.fingerprint,
      });
      txHash = result.txHash || null;
      bridgeDuplicate = Boolean(result.duplicate);
    } else if (delta < 0) {
      operation = "burn";
      const result = await bridge("/hospital-burn", {
        walletAddress: account.walletAddress,
        tokenId,
        amount: Math.abs(delta),
        reference:
          "program-ledger-burn:" +
          user._id.toString() +
          ":" +
          context.program._id.toString() +
          ":" +
          ledger.fingerprint,
      });
      txHash = result.txHash || null;
      bridgeDuplicate = Boolean(result.duplicate);
    }

    // The bridge returns a confirmed receipt, so the post-write balance is
    // fully determined by the delta we just applied. Re-reading it cost an
    // extra round-trip per program on every mission completion.
    const verifiedBalance = chainBalance + delta;

    if (verifiedBalance !== ledger.balance) {
      throw new Error(
        "Blockchain reconciliation mismatch for " +
          context.program.name +
          ": ledger=" +
          ledger.balance +
          ", chain=" +
          verifiedBalance
      );
    }

    await CapsuleAward.updateMany(
      {
        patient: patient._id,
        program: context.program._id,
        "blockchain.status": { $ne: "synced" },
      },
      {
        $set: {
          "blockchain.status": "synced",
          "blockchain.txHash": txHash,
          "blockchain.syncedAt": new Date(),
        },
      }
    );

    results.push({
      organization: context.organization.name,
      program: context.program.name,
      symbol: context.program.capsuleSymbol,
      tokenId,
      ledgerBalance: ledger.balance,
      ledgerFingerprint: ledger.fingerprint,
      previousBlockchainBalance: chainBalance,
      blockchainBalance: verifiedBalance,
      operation,
      bridgeDuplicate,
      txHash,
    });
  }

  return {
    enabled: true,
    walletAddress: account.walletAddress,
    network: account.network,
    chainId: account.chainId,
    programs: results,
  };
}

export async function getPatientBlockchainState() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  await connectDB();

  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const account = await BlockchainAccount.findOne({
    userId: user._id.toString(),
  }).lean();

  if (!account) {
    return {
      enabled: blockchainEnabled(),
      account: null,
      programs: [],
    };
  }

  if (!blockchainEnabled()) {
    return {
      enabled: false,
      account,
      programs: [],
    };
  }

  const contexts = await ensureDemoHospitalPrograms(patient);
  const programs = [];

  for (const context of contexts) {
    const tokenId = Number(context.program.blockchain?.tokenId);
    if (!context.program.blockchain?.enabled || !Number.isInteger(tokenId) || tokenId <= 0) {
      continue;
    }

    const ledger = await ledgerBalance(patient._id, context.program._id);
    try {
      const chain = await bridgeGet(
        "/hospital-balance?walletAddress=" +
          encodeURIComponent(account.walletAddress) +
          "&tokenId=" +
          tokenId
      );
      programs.push({
        organization: context.organization.name,
        program: context.program.name,
        symbol: context.program.capsuleSymbol,
        tokenId,
        ledgerBalance: ledger.balance,
        blockchainBalance: Number(chain.balance || 0),
        synchronized: ledger.balance === Number(chain.balance || 0),
      });
    } catch (error) {
      programs.push({
        organization: context.organization.name,
        program: context.program.name,
        symbol: context.program.capsuleSymbol,
        tokenId,
        ledgerBalance: ledger.balance,
        blockchainBalance: null,
        synchronized: false,
        error: error.message,
      });
    }
  }

  return JSON.parse(
    JSON.stringify({
      enabled: true,
      account,
      programs,
    })
  );
}
