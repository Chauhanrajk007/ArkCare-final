import { NextResponse } from "next/server";
import { blockchainEnabled, blockchainHealth } from "@/lib/carequest/blockchain";

// Unauthenticated liveness probe for the platform (Render's healthCheckPath).
// It reports status only and never echoes a secret, a Mongo URI or a key.
//
// The blockchain is reported but never required: the chain is a non-clinical
// proof rail, so a bridge outage must not make the app look unhealthy.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blockchain = blockchainEnabled()
    ? await blockchainHealth().catch((error) => ({ ok: false, error: error.message }))
    : { disabled: true };

  return NextResponse.json(
    {
      ok: true,
      service: "arkcare-frontend",
      blockchain: {
        enabled: blockchainEnabled(),
        reachable: Boolean(blockchain.ok),
        network: blockchain.network || null,
        chainId: blockchain.chainId || null,
        explorer: blockchain.explorer || null,
        error: blockchain.error || null,
      },
    },
    { status: 200 }
  );
}
