import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { PRODUCT_BY_CODE } from "@/lib/constants";
import { legacyPricesView, loadPriceItems, priceBookCompanyId, upsertTemplateItem } from "@/lib/price-items";

// GET — прайс в старой форме (каталог + переопределения + бывшие CustomItem).
// С 01.10.2026 источник — PriceItem («Мой прайс»), ответ не изменился:
// приложение в сторах и веб-кабинет читают его как раньше.
export async function GET() {
  try {
    const master = await requireAuth();
    // Прайс общий на компанию — читаем и пишем у владельца (Этап 3).
    const scope = await getScope(master);
    const companyId = await priceBookCompanyId(scope.ownerId);
    const rows = await loadPriceItems(companyId);
    return NextResponse.json(legacyPricesView(rows));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get prices error:", error);
    return NextResponse.json(
      { error: "Ошибка получения цен" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    // Цены компании меняет только владелец (аудит 01.10.2026: раньше любой
    // участник бригады мог переписать прайс). Участник правит цену в самом КП.
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Цены компании меняет её владелец" }, { status: 403 });
    }
    const body = await request.json();
    const { items } = body as { items: { itemCode: string; price: number; installerPrice?: number | null }[] };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Данные цен обязательны" },
        { status: 400 }
      );
    }

    // Те же границы, что и при правке одной позиции (21.09.2026).
    const bad = items.find((it) => typeof it.price !== "number" || !Number.isFinite(it.price) || it.price < 0 || it.price > 10_000_000);
    if (bad) {
      return NextResponse.json({ error: `Цена «${bad.itemCode}» должна быть от 0 до 10 000 000 ₸` }, { status: 400 });
    }
    const unknown = items.find((it) => !PRODUCT_BY_CODE[it.itemCode]);
    if (unknown) {
      return NextResponse.json({ error: `Неизвестная позиция «${unknown.itemCode}»` }, { status: 400 });
    }

    const companyId = await priceBookCompanyId(scope.ownerId);
    await Promise.all(
      items.map((item) =>
        upsertTemplateItem(companyId, item.itemCode, {
          price: item.price,
          ...(item.installerPrice !== undefined && { installerPrice: item.installerPrice === null ? null : item.installerPrice }),
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update prices error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления цен" },
      { status: 500 }
    );
  }
}
