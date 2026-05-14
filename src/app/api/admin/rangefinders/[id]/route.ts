import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RangefinderStatus } from "@/generated/prisma/client";

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

const ALLOWED_STATUSES: RangefinderStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "ACTIVATED",
  "SOLD",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner();
    const { id } = await params;
    const body = await request.json();
    const { name, mac, token, bleKey, serial, note, ownerId, status } = body;

    const target = await prisma.rangefinder.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Укажите имя" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (mac !== undefined) {
      if (typeof mac !== "string" || !/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(mac)) {
        return NextResponse.json({ error: "MAC неверный" }, { status: 400 });
      }
      data.mac = mac.toUpperCase();
    }
    if (token !== undefined) {
      if (typeof token !== "string" || !/^[0-9a-f]{24}$/i.test(token)) {
        return NextResponse.json({ error: "Token неверный" }, { status: 400 });
      }
      data.token = token.toLowerCase();
    }
    if (bleKey !== undefined) {
      if (bleKey && !/^[0-9a-f]{32}$/i.test(bleKey)) {
        return NextResponse.json({ error: "BLE key неверный" }, { status: 400 });
      }
      data.bleKey = bleKey ? bleKey.toLowerCase() : null;
    }
    if (serial !== undefined) {
      data.serial = serial?.trim() || null;
    }
    if (note !== undefined) {
      data.note = note?.trim() || null;
    }
    if (ownerId !== undefined) {
      data.ownerId = ownerId || null;
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
      }
      data.status = status;
      if (status === "ACTIVATED" && !target.activatedAt) {
        data.activatedAt = new Date();
      }
    }

    await prisma.rangefinder.update({ where: { id }, data });
    return NextResponse.json({ success: true });
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
        { error: "MAC или serial уже занят другой рулеткой" },
        { status: 409 },
      );
    }
    console.error("Rangefinder update error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner();
    const { id } = await params;
    await prisma.rangefinder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    console.error("Rangefinder delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
