import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const out: Record<string, unknown> = {};

  // Step 1: count (известно что работает)
  try {
    const t0 = Date.now();
    out.masterCount = await prisma.master.count();
    out.countTookMs = Date.now() - t0;
  } catch (e) {
    out.countErr = e instanceof Error ? e.message : String(e);
  }

  // Step 2: findUnique по phone (как в login)
  try {
    const t0 = Date.now();
    const r = await prisma.master.findUnique({
      where: { phone: "+79999999999" },
      select: { id: true },
    });
    out.findUniqueOk = true;
    out.findUniqueResult = r;
    out.findUniqueTookMs = Date.now() - t0;
  } catch (e) {
    out.findUniqueOk = false;
    out.findUniqueErr = e instanceof Error ? e.message : String(e);
    if (e instanceof Error) {
      out.findUniqueStack = e.stack?.split("\n").slice(0, 8).join("\n");
      const anyE = e as unknown as { code?: string };
      out.findUniqueCode = anyE.code;
    }
  }

  // Step 3: findFirst (тоже SELECT WHERE)
  try {
    const t0 = Date.now();
    const r = await prisma.master.findFirst({ select: { id: true } });
    out.findFirstOk = true;
    out.findFirstHasResult = !!r;
    out.findFirstTookMs = Date.now() - t0;
  } catch (e) {
    out.findFirstOk = false;
    out.findFirstErr = e instanceof Error ? e.message : String(e);
  }

  out.hasDbUrl = !!process.env.DATABASE_URL;
  out.dbUrlPrefix = process.env.DATABASE_URL?.slice(0, 25) ?? null;
  out.nodeEnv = process.env.NODE_ENV ?? null;
  return NextResponse.json(out);
}
