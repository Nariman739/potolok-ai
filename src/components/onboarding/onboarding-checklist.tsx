import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";

type ChecklistItem = {
  done: boolean;
  label: string;
  href?: string;
  hrefLabel?: string;
};

export function OnboardingChecklist({
  hasProfile,
  hasLogo,
  hasFirstEstimate,
  hasClient,
}: {
  hasProfile: boolean;
  hasLogo: boolean;
  hasFirstEstimate: boolean;
  hasClient: boolean;
}) {
  const items: ChecklistItem[] = [
    {
      done: hasProfile,
      label: "Заполни профиль (компания, контакты, реквизиты)",
      href: "/dashboard/profile",
      hrefLabel: "Заполнить",
    },
    {
      done: hasLogo,
      label: "Загрузи логотип — будет в КП и договоре",
      href: "/dashboard/profile",
      hrefLabel: "Загрузить",
    },
    {
      done: hasFirstEstimate,
      label: "Создай первый КП — это занимает 2 минуты",
      href: "/dashboard/quick-estimate",
      hrefLabel: "Создать",
    },
    {
      done: hasClient,
      label: "Открой раздел «Клиенты» — твоя CRM",
      href: "/dashboard/clients",
      hrefLabel: "Открыть",
    },
  ];

  const allDone = items.every((i) => i.done);
  if (allDone) return null;

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;

  return (
    <Card className="border-[#1e3a5f]/30 bg-gradient-to-br from-[#1e3a5f]/5 to-transparent">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#1e3a5f]" />
          Первые шаги
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {doneCount} из {total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className={
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 " +
              (it.done ? "opacity-60" : "bg-white")
            }
          >
            {it.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2 flex-wrap">
              <span
                className={
                  "text-sm " +
                  (it.done ? "line-through text-muted-foreground" : "")
                }
              >
                {it.label}
              </span>
              {!it.done && it.href && it.hrefLabel && (
                <Link
                  href={it.href}
                  className="text-xs font-medium text-[#1e3a5f] hover:underline"
                >
                  {it.hrefLabel} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
