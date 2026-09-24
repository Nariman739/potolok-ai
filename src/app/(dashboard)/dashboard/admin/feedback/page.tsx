import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import type { Metadata } from "next";

/**
 * Что мастера просят добавить (Нариман, 24.09.2026): помощник в приложении
 * спрашивает, чего не хватает, и складывает ответы сюда. Раньше такие слова
 * оставались в чатах и до нас не доходили.
 */

export const metadata: Metadata = { title: "Пожелания мастеров — Админ" };
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");
  const me = await prisma.master.findUnique({ where: { id: master.id }, select: { isOwner: true } });
  if (!me?.isOwner) redirect("/dashboard");

  const items = await prisma.masterFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { master: { select: { firstName: true, lastName: true, phone: true, companyName: true } } },
  });

  const byTopic = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.topic] = (acc[i.topic] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Пожелания мастеров</h1>
        <Link href="/dashboard/admin" className="text-sm text-muted-foreground hover:underline">
          ← Админ
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока пусто. Помощник в приложении спрашивает мастеров, чего им не хватает,
          и всё сказанное появится здесь.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byTopic)
              .sort((a, b) => b[1] - a[1])
              .map(([topic, n]) => (
                <span key={topic} className="rounded-full border px-3 py-1 text-sm">
                  {topic}: <b>{n}</b>
                </span>
              ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Когда</th>
                  <th className="p-2">Мастер</th>
                  <th className="p-2">Тема</th>
                  <th className="p-2">Что просят</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-2 text-muted-foreground">
                      {i.createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </td>
                    <td className="p-2">
                      {[i.master.firstName, i.master.lastName].filter(Boolean).join(" ") || "Мастер"}
                      <div className="text-xs text-muted-foreground">{i.master.companyName || i.master.phone}</div>
                    </td>
                    <td className="p-2">{i.topic}</td>
                    <td className="p-2">{i.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
