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
      currency: true,
      logoUrl: true,
      tagline: true,
      coverPhotoUrl: true,
      kpConfig: true,
      warrantyMaterials: true,
      warrantyInstall: true,
      kpBrief: { select: { id: true, rationale: true, generatedConfig: true } },
    },
  });

  if (!master) {
    redirect("/auth/login");
  }

  // Порядок важен: сначала то, что мастер сохранил сам, затем то, что собрал AI
  // (у тех, кто прошёл конструктор до автосохранения, конфиг лежит только в брифе),
  // и лишь потом дефолт. Иначе мастер возвращался на страницу, видел дефолтную
  // тему вместо подобранной и, сохранив, затирал работу AI.
  // kpConfig без секций (например, только priceView из профиля мобилки) —
  // не конфиг для редактора: берём бриф/дефолт, но вид цен из него сохраняем.
  const saved = (master.kpConfig as unknown as Partial<KpConfig> | null) ?? null;
  const savedFull = saved && Array.isArray(saved.sections) && saved.sections.length > 0 ? (saved as KpConfig) : null;
  const base: KpConfig =
    savedFull ??
    (master.kpBrief?.generatedConfig as unknown as KpConfig) ??
    DEFAULT_KP_CONFIG;
  const initialConfig: KpConfig = saved?.priceView && !savedFull ? { ...base, priceView: saved.priceView } : base;

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
        currency: master.currency,
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
