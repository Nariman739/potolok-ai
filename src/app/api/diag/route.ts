import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const t0 = Date.now();
    const n = await prisma.master.count();
    out.masterCount = n;
    out.tookMs = Date.now() - t0;
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? e.message : String(e);
    if (e instanceof Error) {
      out.stack = e.stack?.split("\n").slice(0, 6).join("\n");
      const anyE = e as unknown as { code?: string };
      out.code = anyE.code;
    }
  }
  out.hasDbUrl = !!process.env.DATABASE_URL;
  out.dbUrlPrefix = process.env.DATABASE_URL?.slice(0, 25) ?? null;
  out.nodeEnv = process.env.NODE_ENV ?? null;
  return NextResponse.json(out);
}
