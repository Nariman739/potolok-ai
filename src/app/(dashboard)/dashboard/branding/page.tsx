import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_KP_CONFIG } from "@/lib/kp/templates";
import type { KpConfig } from "@/lib/kp/types";
import { BrandingClient } from "./_components/BrandingClient";

export const dynamic = "force-dynamic";

// Конструктор КП. Левая колонка — настройки, правая — превью PDF.
// Если у мастера ещё нет MasterBrief — показываем онбординг визард.
export default async function BrandingPage() {
  const session = await getCurrentMaster();
  if (!session) {
    redirect("/auth/login");
  }

  const master = await prisma.master.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      brandColor: true,
      address: true,
      logoUrl: true,
      tagline: true,
      coverPhotoUrl: true,
      kpConfig: true,
      warrantyMaterials: true,
      warrantyInstall: true,
      kpBrief: { select: { id: true, rationale: true } },
    },
  });

  if (!master) {
    redirect("/auth/login");
  }

  const initialConfig: KpConfig =
    (master.kpConfig as unknown as KpConfig) ?? DEFAULT_KP_CONFIG;

  return (
    <BrandingClient
      hasBrief={!!master.kpBrief}
      initialMaster={{
        id: master.id,
        firstName: master.firstName,
        lastName: master.lastName,
        companyName: master.companyName,
        brandColor: master.brandColor || "#1e3a5f",
        address: master.address,
        logoUrl: master.logoUrl,
        tagline: master.tagline,
        coverPhotoUrl: master.coverPhotoUrl,
        warrantyMaterials: master.warrantyMaterials,
        warrantyInstall: master.warrantyInstall,
      }}
      initialConfig={initialConfig}
      initialRationale={master.kpBrief?.rationale ?? null}
    />
  );
}
