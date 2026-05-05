import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const master = await getCurrentMaster();
  let isOwner = false;
  if (master) {
    const m = await prisma.master.findUnique({
      where: { id: master.id },
      select: { isOwner: true },
    });
    isOwner = !!m?.isOwner;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOwner={isOwner} />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="container mx-auto max-w-5xl p-4 md:p-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
