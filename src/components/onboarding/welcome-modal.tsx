"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calculator, Send, UserCog, ArrowRight, Sparkles } from "lucide-react";

const steps = [
  {
    icon: Calculator,
    title: "Создайте первый расчёт",
    description:
      "Используйте AI Ассистент — отправьте фото чертежа или напишите размеры. Или откройте Калькулятор для ручного ввода.",
    hint: "Цены по умолчанию уже настроены — можно считать сразу!",
  },
  {
    icon: Send,
    title: "Отправьте КП клиенту",
    description:
      "После расчёта сохраните КП и получите ссылку. Отправьте клиенту через WhatsApp — он увидит профессиональное предложение с вашим брендом.",
    hint: "Клиент может принять КП прямо по ссылке",
  },
  {
    icon: UserCog,
    title: "Настройте профиль и прайс",
    description:
      "Добавьте логотип, контакты компании и настройте свои цены. Это не обязательно сейчас — всё работает с настройками по умолчанию.",
    hint: "Можно настроить в любое время",
  },
];

export function WelcomeModal({ isNewUser }: { isNewUser: boolean }) {
  const [open, setOpen] = useState(isNewUser);
  const [step, setStep] = useState(0);

  if (!isNewUser) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1e3a5f]" />
            Добро пожаловать в PotolokAI!
          </DialogTitle>
          <DialogDescription>
            3 простых шага для начала работы
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 py-2">
          {steps.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  i === step
                    ? "bg-[#1e3a5f] text-white"
                    : i < step
                      ? "bg-[#1e3a5f]/20 text-[#1e3a5f]"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 w-6 rounded ${
                    i < step ? "bg-[#1e3a5f]/30" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <div className="rounded-2xl bg-[#1e3a5f]/10 p-4">
            <Icon className="h-8 w-8 text-[#1e3a5f]" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{current.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {current.description}
            </p>
            <p className="text-xs text-[#1e3a5f] font-medium bg-[#1e3a5f]/5 rounded-lg px-3 py-1.5 inline-block">
              {current.hint}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {step > 0 ? (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 sm:flex-none"
            >
              Назад
            </Button>
          ) : (
            <div />
          )}
          {step < steps.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 sm:flex-none bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              Далее
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => setOpen(false)}
              className="flex-1 sm:flex-none bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              Начать работу!
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
