import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { PortfolioManager } from "./portfolio-manager";

export const metadata: Metadata = {
  title: "Портфолио",
};

export default async function PortfolioPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const [works, masterData] = await Promise.all([
    prisma.portfolioWork.findMany({
      where: { masterId: master.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.master.findUnique({
      where: { id: master.id },
      select: {
        portfolioSlug: true,
        portfolioBio: true,
        firstName: true,
        companyName: true,
        whatsappPhone: true,
        address: true,
      },
    }),
  ]);

  // Авто-генерация slug если ещё нет
  let settings = masterData;
  if (settings && !settings.portfolioSlug) {
    const baseSlug = (settings.firstName || "master")
      .toLowerCase()
      .replace(/[а-яё]/g, (c: string) => {
        const map: Record<string, string> = {
          а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",
          к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
          х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
        };
        return map[c] || c;
      })
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.master.findUnique({ where: { portfolioSlug: slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    await prisma.master.update({
      where: { id: master.id },
      data: { portfolioSlug: slug },
    });
    settings = { ...settings, portfolioSlug: slug };
  }

  return (
    <PortfolioManager
      works={works.map((w) => ({
        ...w,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      }))}
      settings={{
        portfolioSlug: settings?.portfolioSlug || "",
        portfolioBio: settings?.portfolioBio || "",
        firstName: settings?.firstName || "",
        companyName: settings?.companyName || "",
        whatsappPhone: settings?.whatsappPhone || "",
        address: settings?.address || "",
      }}
    />
  );
}
