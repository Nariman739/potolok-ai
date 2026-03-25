import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, MessageCircle } from "lucide-react";
import { PortfolioGallery } from "./portfolio-gallery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const master = await prisma.master.findUnique({
    where: { portfolioSlug: slug },
    select: { companyName: true, firstName: true, address: true },
  });

  if (!master) return { title: "Мастер не найден" };

  const name = master.companyName || master.firstName;
  return {
    title: `${name} — Натяжные потолки | PotolokAI`,
    description: `Портфолио работ мастера ${name}${master.address ? ` — ${master.address}` : ""}. Натяжные потолки с расчётом за 60 секунд.`,
    openGraph: {
      title: `${name} — Натяжные потолки`,
      description: `Портфолио работ мастера ${name}`,
    },
  };
}

export default async function MasterPortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const master = await prisma.master.findUnique({
    where: { portfolioSlug: slug },
    select: {
      firstName: true,
      lastName: true,
      companyName: true,
      logoUrl: true,
      brandColor: true,
      address: true,
      whatsappPhone: true,
      phone: true,
      portfolioBio: true,
      portfolioWorks: {
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          description: true,
          ceilingType: true,
          area: true,
          photos: true,
          videoUrl: true,
        },
      },
    },
  });

  if (!master) notFound();

  const name = master.companyName || `${master.firstName} ${master.lastName || ""}`.trim();
  const whatsapp = master.whatsappPhone || master.phone;
  const whatsappUrl = whatsapp
    ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`
    : null;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header
        className="relative px-4 py-12 text-center text-white"
        style={{ backgroundColor: master.brandColor || "#1e3a5f" }}
      >
        <div className="max-w-2xl mx-auto">
          {master.logoUrl && (
            <div className="relative w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden bg-white/20">
              <Image src={master.logoUrl} alt={name} fill className="object-cover" sizes="80px" />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold">{name}</h1>
          {master.address && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-white/80 text-sm">
              <MapPin className="h-4 w-4" />
              {master.address}
            </p>
          )}
          {master.portfolioBio && (
            <p className="mt-3 text-white/90 text-sm max-w-md mx-auto">
              {master.portfolioBio}
            </p>
          )}
          {/* CTA кнопки */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-gray-900 font-medium px-5 py-2.5 rounded-full text-sm hover:bg-white/90 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Написать в WhatsApp
              </a>
            )}
            {whatsapp && (
              <a
                href={`tel:${whatsapp}`}
                className="inline-flex items-center gap-2 bg-white/20 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-white/30 transition-colors"
              >
                <Phone className="h-4 w-4" />
                Позвонить
              </a>
            )}
          </div>
          {/* Catalog link */}
          <div className="mt-4">
            <Link
              href={`/master/${slug}/catalog`}
              className="inline-flex items-center gap-2 text-white/80 text-sm hover:text-white transition-colors underline underline-offset-4"
            >
              Каталог материалов и цены
            </Link>
          </div>
        </div>
      </header>

      {/* Работы */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {master.portfolioWorks.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Мастер ещё не добавил работы
          </p>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-6">
              Работы ({master.portfolioWorks.length})
            </h2>
            <PortfolioGallery works={master.portfolioWorks} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground border-t">
        Сделано в{" "}
        <Link href="/" className="text-[#1e3a5f] hover:underline font-medium">
          PotolokAI
        </Link>
      </footer>
    </div>
  );
}
