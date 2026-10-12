import Link from "next/link";

/** Общая обёртка юридических страниц (оферта, возврат, контакты) — как в /privacy. */
export function LegalArticle({ title, children }: { title: string; children: React.ReactNode }) {
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <article className="container mx-auto max-w-3xl px-4 py-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:my-3 [&_li]:leading-relaxed text-sm md:text-base">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
        <Link href="/" className="hover:underline">← На главную</Link>
        <Link href="/pricing" className="hover:underline">Тарифы</Link>
        <Link href="/terms" className="hover:underline">Оферта</Link>
        <Link href="/refund" className="hover:underline">Возврат</Link>
        <Link href="/privacy" className="hover:underline">Конфиденциальность</Link>
        <Link href="/contacts" className="hover:underline">Контакты</Link>
      </nav>
      <h1>{title}</h1>
      <p className="text-sm text-muted-foreground">Редакция от {today}.</p>
      {children}
    </article>
  );
}
