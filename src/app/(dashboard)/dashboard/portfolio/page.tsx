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

  const [works, settings] = await Promise.all([
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
