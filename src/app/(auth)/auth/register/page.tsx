"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    // Берём последние 10 цифр (нац. номер) + префикс +7. Так лишний код страны
    // (7/8/77), который мастер мог дописать поверх готового «+7», отсекается —
    // иначе получалась лишняя 7 (инцидент 06.07: propotolokkz +777... вместо +7707...).
    const phoneDigits = (formData.get("phone") as string).replace(/\D/g, "").slice(-10);
    const phone = "+7" + phoneDigits;
    const password = formData.get("password") as string;
    const passwordConfirm = formData.get("passwordConfirm") as string;
    const firstName = formData.get("firstName") as string;
    const companyName = formData.get("companyName") as string;

    if (password.length < 4) {
      toast.error("Пароль минимум 4 символа");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("Пароли не совпадают");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, firstName, companyName }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Ошибка регистрации");
        return;
      }

      toast.success("Регистрация успешна!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Регистрация</CardTitle>
        <CardDescription>
          Создайте аккаунт и начните делать расчёты
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Ваше имя</Label>
            <Input
              id="firstName"
              name="firstName"
              placeholder="Нариман"
              required
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">Название компании</Label>
            <Input
              id="companyName"
              name="companyName"
              placeholder="Мастер Потолков (необязательно)"
              autoComplete="organization"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Номер телефона</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                +7
              </span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="700 123 4567"
                required
                autoComplete="tel"
                className="rounded-l-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Минимум 4 символа"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passwordConfirm">Повторите пароль</Label>
            <Input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              placeholder="Введите пароль ещё раз"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full bg-[#1e3a5f] hover:bg-[#152d4a]"
            disabled={loading}
          >
            {loading ? "Создание..." : "Создать аккаунт"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-[#1e3a5f] hover:underline"
            >
              Войти
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
