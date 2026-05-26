import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const out: Record<string, unknown> = { step: "start" };
  try {
    out.step = "ip";
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    out.step = "ratelimit";
    const rl = checkRateLimit(`diag-login:${ip}`, 100, 15 * 60 * 1000);
    out.rl = rl;

    out.step = "body";
    const body = await request.json();
    const { phone: rawPhone, password } = body;

    out.step = "normalizePhone";
    const phone = normalizePhone(rawPhone);
    out.phone = phone;
    if (!phone) {
      out.step = "phone-null";
      return NextResponse.json(out, { status: 400 });
    }

    out.step = "findUnique";
    const t0 = Date.now();
    const master = await prisma.master.findUnique({ where: { phone } });
    out.findUniqueTookMs = Date.now() - t0;
    out.masterFound = !!master;
    if (!master) {
      out.step = "no-master";
      return NextResponse.json(out, { status: 200 });
    }
    out.masterId = master.id;
    out.masterIsActive = master.isActive;

    out.step = "verifyPassword";
    const t1 = Date.now();
    const valid = await verifyPassword(password, master.passwordHash);
    out.verifyTookMs = Date.now() - t1;
    out.passwordValid = valid;

    if (valid) {
      out.step = "createSession";
      const t2 = Date.now();
      const token = await createSession(master.id);
      out.sessionTookMs = Date.now() - t2;
      out.hasToken = !!token;
    }

    out.step = "done";
    return NextResponse.json(out);
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    out.errorName = e instanceof Error ? e.name : null;
    out.stack = e instanceof Error ? e.stack?.split("\n").slice(0, 10).join("\n") : null;
    return NextResponse.json(out, { status: 500 });
  }
}

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
