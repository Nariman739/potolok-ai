"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

const TELEGRAM_RESET_URL = "https://t.me/PotolokAiBot?start=reset";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Форма «по номеру» убрана (Нариман 2026-06-23) — у 95 из 105 мастеров
  // telegramChatId=null, API молча проваливал отправку. SMS не подключали.
  // Единственный путь восстановления — Telegram bot (handleTelegramReset).
  // Если когда-нибудь подключим SMS — handleSendOtp восстановить из git history
  // (commit dca4f52 / 7d58c0e).

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "+7" + phone.replace(/\D/g, ""),
          otp,
          newPassword,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Пароль изменён! Войдите с новым паролем.");
        router.push("/auth/login");
      } else {
        toast.error(d.error || "Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  function handleTelegramReset() {
    // Открываем @PotolokAiBot с deep-link ?start=reset — бот сразу попросит
    // поделиться номером и пришлёт OTP в чат.
    window.open(TELEGRAM_RESET_URL, "_blank", "noopener,noreferrer");
    setStep("otp");
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Сброс пароля</CardTitle>
        <CardDescription>
          {step === "phone"
            ? "Получите код в Telegram — без ввода номера руками"
            : "Введите код из Telegram, ваш номер и новый пароль"}
        </CardDescription>
      </CardHeader>

      {step === "phone" ? (
        <>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={handleTelegramReset}
              className="w-full flex items-center gap-3 rounded-md bg-[#0088cc] hover:bg-[#0077b3] transition-colors p-4 text-left"
            >
              <span className="text-2xl">📨</span>
              <div className="flex-1">
                <div className="font-semibold text-white">Восстановить через Telegram</div>
                <div className="text-xs text-white/85 mt-0.5">
                  Откроется @PotolokAiBot → «Поделиться номером» → код придёт в чат. Работает даже если вы никогда раньше не привязывали Telegram.
                </div>
              </div>
              <span className="text-white/70">›</span>
            </button>

            <p className="text-xs text-center text-muted-foreground">
              Бот найдёт ваш аккаунт по номеру из Telegram. Если регистрировались с другим номером — бот всё равно опознает по последним цифрам.
            </p>

            {/* Форма «по номеру» убрана (Нариман 2026-06-23). У 95 из 105 мастеров
                telegramChatId=null — для них этот путь молча проваливался ничего
                не отправляя. SMS мы не подключали, поэтому единственный рабочий
                путь восстановления — через Telegram бота выше. Если в будущем
                подключим SMS-провайдера, форму вернуть с реальной отправкой. */}

            <Link href="/auth/login" className="block text-center text-sm font-medium text-[#1e3a5f] hover:underline">
              Вернуться ко входу
            </Link>
          </CardContent>
        </>
      ) : (
        <form onSubmit={handleReset}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Код из Telegram</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                placeholder="123456"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneReset">Ваш номер телефона</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                  +7
                </span>
                <Input
                  id="phoneReset"
                  type="tel"
                  placeholder="700 123 4567"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-l-none"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Новый пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Минимум 4 символа"
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a]"
              disabled={loading}
            >
              {loading ? "Сохраняем..." : "Сменить пароль"}
            </Button>
            <p className="text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="font-medium text-[#1e3a5f] hover:underline"
              >
                Запросить код повторно
              </button>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
