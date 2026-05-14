import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RangefinderStatus } from "@/generated/prisma/client";

const QR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateQrCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += QR_ALPHABET[Math.floor(Math.random() * QR_ALPHABET.length)];
  }
  return code;
}

async function requireOwner() {
  const me = await requireAuth();
  const row = await prisma.master.findUnique({
    where: { id: me.id },
    select: { isOwner: true },
  });
  if (!row?.isOwner) {
    throw new Error("Forbidden");
  }
}

export async function GET() {
  try {
    await requireOwner();
    const rangefinders = await prisma.rangefinder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });
    return NextResponse.json({
      rangefinders: rangefinders.map((r) => ({
        id: r.id,
        serial: r.serial,
        name: r.name,
        mac: r.mac,
        token: r.token,
        bleKey: r.bleKey,
        qrCode: r.qrCode,
        status: r.status,
        ownerId: r.ownerId,
        owner: r.owner
          ? {
              id: r.owner.id,
              name: [r.owner.firstName, r.owner.lastName].filter(Boolean).join(" "),
              phone: r.owner.phone,
            }
          : null,
        note: r.note,
        activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    console.error("Rangefinders list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const body = await request.json();
    const { name, mac, token, bleKey, serial, note, ownerId, status } = body;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Укажите имя" }, { status: 400 });
    }
    if (typeof mac !== "string" || !/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(mac)) {
      return NextResponse.json(
        { error: "MAC адрес должен быть в формате XX:XX:XX:XX:XX:XX" },
        { status: 400 },
      );
    }
    if (typeof token !== "string" || !/^[0-9a-f]{24}$/i.test(token)) {
      return NextResponse.json(
        { error: "Token должен быть 24 hex символа" },
        { status: 400 },
      );
    }
    if (bleKey != null && bleKey !== "" && !/^[0-9a-f]{32}$/i.test(bleKey)) {
      return NextResponse.json(
        { error: "BLE key должен быть 32 hex символа (или пусто)" },
        { status: 400 },
      );
    }

    const macUpper = mac.toUpperCase();
    const tokenLower = token.toLowerCase();
    const bleKeyLower = bleKey ? bleKey.toLowerCase() : null;

    let qrCode = generateQrCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.rangefinder.findUnique({ where: { qrCode } });
      if (!exists) break;
      qrCode = generateQrCode();
    }

    const created = await prisma.rangefinder.create({
      data: {
        name: name.trim(),
        mac: macUpper,
        token: tokenLower,
        bleKey: bleKeyLower,
        serial: serial?.trim() || null,
        note: note?.trim() || null,
        qrCode,
        ownerId: ownerId || null,
        status: (status as RangefinderStatus) || "AVAILABLE",
      },
    });

    return NextResponse.json({ id: created.id, qrCode: created.qrCode });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Рулетка с таким MAC или serial уже есть" },
        { status: 409 },
      );
    }
    console.error("Rangefinder create error:", error);
    return NextResponse.json({ error: "Ошибка создания" }, { status: 500 });
  }
}
