import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCT_ITEMS, DEFAULT_PRICES, CATEGORY_LABELS } from "@/lib/constants";
import type { ProductCategory } from "@/lib/constants";
import { CatalogConfigurator } from "./catalog-configurator";

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
    title: `Каталог — ${name} | PotolokAI`,
    description: `Каталог натяжных потолков от ${name}. Выберите материалы и посмотрите стоимость.`,
  };
}

// Categories to show in catalog (exclude special and install)
const CATALOG_CATEGORIES: ProductCategory[] = [
  "canvas", "profile", "spot", "chandelier", "curtain", "gardina", "podshtornik", "corner", "other",
];

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const master = await prisma.master.findUnique({
    where: { portfolioSlug: slug },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      logoUrl: true,
      brandColor: true,
      address: true,
      whatsappPhone: true,
      phone: true,
      portfolioSlug: true,
    },
  });

  if (!master) notFound();

  // Load master's price overrides
  const masterPrices = await prisma.masterPrice.findMany({
    where: { masterId: master.id },
  });
  const priceOverrides: Record<string, number> = {};
  for (const mp of masterPrices) priceOverrides[mp.itemCode] = mp.price;

  // Build catalog items with master's prices
  const catalogItems = PRODUCT_ITEMS
    .filter(item => CATALOG_CATEGORIES.includes(item.category))
    .map(item => ({
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      description: item.description || "",
      price: priceOverrides[item.code] ?? DEFAULT_PRICES[item.code] ?? item.defaultPrice,
    }));

  // Group by category
  const grouped = CATALOG_CATEGORIES
    .map(cat => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: catalogItems.filter(i => i.category === cat),
    }))
    .filter(g => g.items.length > 0);

  const name = master.companyName || `${master.firstName} ${master.lastName || ""}`.trim();
  const brandColor = master.brandColor || "#1e3a5f";
  const contactPhone = master.whatsappPhone || master.phone || "";

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)` }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        </div>
        <div className="relative max-w-2xl mx-auto px-4 py-10 text-center text-white">
          {master.logoUrl && (
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
              <img src={master.logoUrl} alt="" className="w-12 h-12 object-contain" />
            </div>
          )}
          <h1 className="text-2xl font-bold">{name}</h1>
          {master.address && (
            <p className="text-sm opacity-80 mt-1">{master.address}</p>
          )}
          <p className="text-lg font-medium mt-3 opacity-90">Каталог материалов</p>
          <p className="text-sm opacity-70 mt-1">Выберите материалы для вашего потолка и узнайте стоимость</p>
        </div>
      </div>

      {/* Configurator */}
      <CatalogConfigurator
        grouped={grouped}
        masterName={name}
        brandColor={brandColor}
        contactPhone={contactPhone}
        slug={master.portfolioSlug || slug}
      />
    </div>
  );
}
