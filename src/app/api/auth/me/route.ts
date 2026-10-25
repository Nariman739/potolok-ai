import { NextResponse } from "next/server";
import { getCurrentMaster } from "@/lib/auth";
import { headers } from "next/headers";
import { getBillingStatus } from "@/lib/billing";
import { reportError } from "@/lib/report-error";

/**
 * Профиль + статус подписки для мобилки (поле `billing`, 12.10.2026).
 * Мобилка показывает плашку по announce / objectsUsed / freeLeft / inGrace /
 * graceUsed / daysLeft; в iOS — без цен и ссылок на оплату (App Store 3.1.1),
 * цены там игнорировать. Типы — src/lib/billing-client.ts.
 */
export async function GET() {
  try {
    // Мобилка шлёт Bearer, а роут смотрел только cookie: на телефоне выручала
    // cookie, которую React Native сохраняет после логина, но без неё /auth/me
    // отвечал 401 и выкидывал мастера на вход (16.10.2026).
    const auth = (await headers()).get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const master = (await getCurrentMaster()) ?? (bearer ? await getCurrentMaster(bearer) : null);
    if (!master) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }
    const billing = await getBillingStatus(master.id);
    return NextResponse.json({ ...master, billing });
  } catch (error) {
    reportError(error, "auth/me", "Get me error");
    return NextResponse.json(
      { error: "Ошибка получения данных" },
      { status: 500 }
    );
  }
}
