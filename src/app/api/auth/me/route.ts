import { NextResponse } from "next/server";
import { getCurrentMaster } from "@/lib/auth";
import { getBillingStatus } from "@/lib/billing";

/**
 * Профиль + статус подписки для мобилки (поле `billing`, 12.10.2026).
 * Мобилка показывает плашку по freePeriod / objectsUsed / daysLeft; в iOS —
 * без цен и ссылок на оплату (App Store 3.1.1), цены там игнорировать.
 */
export async function GET() {
  try {
    const master = await getCurrentMaster();
    if (!master) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }
    const billing = await getBillingStatus(master.id);
    return NextResponse.json({ ...master, billing });
  } catch (error) {
    console.error("Get me error:", error);
    return NextResponse.json(
      { error: "Ошибка получения данных" },
      { status: 500 }
    );
  }
}
