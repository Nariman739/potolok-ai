import { cookies } from "next/headers";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { MasterProfile } from "./types";

const SESSION_COOKIE = "session_token";
const SESSION_DURATION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(masterId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await prisma.session.create({
    data: { masterId, token, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentMaster(bearerToken?: string): Promise<MasterProfile | null> {
  const cookieStore = await cookies();
  const token = bearerToken || cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { master: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  const m = session.master;
  if (!m.isActive) {
    return null;
  }

  return {
    id: m.id,
    email: m.email,
    firstName: m.firstName,
    lastName: m.lastName,
    phone: m.phone,
    companyName: m.companyName,
    logoUrl: m.logoUrl,
    brandColor: m.brandColor,
    instagramUrl: m.instagramUrl,
    whatsappPhone: m.whatsappPhone,
    address: m.address,
    subscriptionTier: m.subscriptionTier,
    kpGeneratedThisMonth: m.kpGeneratedThisMonth,
    telegramChatId: m.telegramChatId,
    contractType: m.contractType,
    bin: m.bin,
    iin: m.iin,
    legalName: m.legalName,
    legalAddress: m.legalAddress,
    bankName: m.bankName,
    iban: m.iban,
    kbe: m.kbe,
    bik: m.bik,
    passportData: m.passportData,
    prepaymentPercent: m.prepaymentPercent,
    warrantyMaterials: m.warrantyMaterials,
    warrantyInstall: m.warrantyInstall,
    contractCity: m.contractCity,
  };
}

export async function requireAuth(request?: Request): Promise<MasterProfile> {
  // Try cookie first (web)
  let master = await getCurrentMaster();
  if (master) return master;

  // Try Bearer token from Authorization header (mobile app)
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      master = await getCurrentMaster(authHeader.slice(7));
      if (master) return master;
    }
  }

  // Try from headers() — for Next.js API routes that don't pass request
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      master = await getCurrentMaster(authHeader.slice(7));
      if (master) return master;
    }
  } catch {
    // headers() not available outside request context
  }

  throw new Error("Unauthorized");
}
