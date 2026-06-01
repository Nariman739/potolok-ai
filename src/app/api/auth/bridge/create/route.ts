import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const BRIDGE_TTL_MS = 60_000; // 60 seconds — long enough to open a browser tab.

// POST /api/auth/bridge/create
// Authenticated (cookie or Bearer). Returns { token, expiresAt } — the caller
// (mobile app) embeds the token in a URL: /api/auth/bridge?bt=<token>&redirect=…
// The token is single-use and expires in 60s, so it stays useful even if it
// leaks to logs.
export async function POST() {
  let master;
  try {
    master = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + BRIDGE_TTL_MS);

  await prisma.bridgeToken.create({
    data: { masterId: master.id, token, expiresAt },
  });

  return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
}
