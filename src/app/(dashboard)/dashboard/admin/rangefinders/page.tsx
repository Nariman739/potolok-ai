import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import type { Metadata } from "next";
import { RangefindersPanel } from "./rangefinders-panel";

export const metadata: Metadata = {
  title: "Рулетки — Админ",
};

export const dynamic = "force-dynamic";

export default async function RangefindersPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const me = await prisma.master.findUnique({
    where: { id: master.id },
    select: { isOwner: true },
  });
  if (!me?.isOwner) {
    redirect("/dashboard");
  }

  const [rangefinders, masters] = await Promise.all([
    prisma.rangefinder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    }),
    prisma.master.findMany({
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
  ]);

  return (
    <RangefindersPanel
      rangefinders={rangefinders.map((r) => ({
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
      }))}
      masters={masters.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(" "),
        phone: m.phone,
      }))}
    />
  );
}
