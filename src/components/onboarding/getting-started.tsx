import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Bot,
  Calculator,
  Send,
  UserCog,
  Lightbulb,
} from "lucide-react";

export function GettingStarted({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="border-[#1e3a5f]/20 bg-gradient-to-br from-[#1e3a5f]/5 to-transparent">
        <CardContent className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e3a5f]/10">
            <Rocket className="h-7 w-7 text-[#1e3a5f]" />
          </div>
          <h2 className="text-xl font-bold">Начни здесь, {firstName}!</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Три шага до первого коммерческого предложения
          </p>
        </CardContent>
      </Card>

      {/* Step 1 — active */}
      <Card className="border-[#1e3a5f] border-2 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-[#1e3a5f]" />
        <CardContent className="py-5 pl-6 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-white font-bold text-sm">
            1
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Создай расчёт</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI Ассистент рассчитает по фото или тексту, а Калькулятор — для
              ручного ввода
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                asChild
                size="sm"
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                <Link href="/dashboard/assistant">
                  <Bot className="h-4 w-4 mr-1.5" />
                  AI Ассистент
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/calculator">
                  <Calculator className="h-4 w-4 mr-1.5" />
                  Калькулятор
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — upcoming */}
      <Card className="border-dashed opacity-60">
        <CardContent className="py-5 pl-6 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-sm">
            2
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">
              Отправь КП клиенту
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              <Send className="h-3.5 w-3.5 inline mr-1" />
              Сохрани расчёт, получи ссылку и отправь через WhatsApp
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — upcoming */}
      <Card className="border-dashed opacity-60">
        <CardContent className="py-5 pl-6 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-sm">
            3
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">
              Настрой профиль и прайс
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              <UserCog className="h-3.5 w-3.5 inline mr-1" />
              Добавь логотип, контакты и настрой цены под свой бизнес
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tip */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
        <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <span className="font-medium">Подсказка:</span> цены по умолчанию уже
          настроены. Начните с расчёта — настраивать прайс можно позже.
        </p>
      </div>
    </div>
  );
}
