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

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+7" + phone.replace(/\D/g, "") }),
      });
      if (res.ok) {
        toast.success("Если аккаунт привязан к Telegram — код отправлен");
        setStep("otp");
      } else {
        const d = await res.json();
        toast.error(d.error || "Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Сброс пароля</CardTitle>
        <CardDescription>
          {step === "phone"
            ? "Введите номер телефона — пришлём код в Telegram"
            : "Введите код из Telegram и новый пароль"}
        </CardDescription>
      </CardHeader>

      {step === "phone" ? (
        <form onSubmit={handleSendOtp}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Номер телефона</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                  +7
                </span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="700 123 4567"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-l-none"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a]"
              disabled={loading}
            >
              {loading ? "Отправляем..." : "Получить код"}
            </Button>
            <p className="text-sm text-muted-foreground">
              <Link href="/auth/login" className="font-medium text-[#1e3a5f] hover:underline">
                Вернуться ко входу
              </Link>
            </p>
          </CardFooter>
        </form>
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
              <Label htmlFor="password">Новый пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Минимум 6 символов"
                required
                minLength={6}
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
