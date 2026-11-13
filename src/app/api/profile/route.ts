import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENCY_CODES } from "@/lib/currency";
import { KP_PRICE_VIEWS } from "@/lib/kp/types";
import { DEFAULT_KP_CONFIG } from "@/lib/kp/templates";
import { reseedPricesOnCurrencyChange, reseedHint, type ReseedOutcome } from "@/lib/price-reseed";
import { normalizeProfilePhone } from "@/lib/phone-format";
import { normalizePhone as normalizeE164 } from "@/lib/phone";

export async function GET() {
  try {
    const master = await requireAuth();
    return NextResponse.json(master);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "Ошибка получения профиля" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();

    const allowedFields = [
      "firstName",
      "lastName",
      "phone",
      "companyName",
      "brandColor",
      "instagramUrl",
      "whatsappPhone",
      "address",
      "contractType",
      "bin",
      "iin",
      "legalName",
      "legalAddress",
      "bankName",
      "iban",
      "kbe",
      "bik",
      "passportData",
      "contractCity",
      "onboardingCompleted",
      // Язык мастера: приложение присылает свой выбор, сервер отвечает на нём
      // же — помощник, уведомления, документы клиенту (25.09.2026).
      "language",
      // Валюта цен и документов (07.10.2026): KZT | RUB.
      "currency",
      // Откуда узнал: instagram | friend | other (07.10.2026).
      "source",
    ];

    const intFields = ["prepaymentPercent", "warrantyMaterials", "warrantyInstall"];
    const boolFields = ["onboardingCompleted"];

    const updateData: Record<string, string | number | boolean | object> = {};
    // Настройки дизайнера мобилки (13.10.2026): { hiddenPalette: string[] }.
    // Храним на сервере, чтобы скрытые карточки не терялись при переустановке.
    if ("designerPrefs" in body) {
      const dp = body.designerPrefs;
      if (!dp || typeof dp !== "object" || Array.isArray(dp)) {
        return NextResponse.json({ error: "designerPrefs должен быть объектом" }, { status: 400 });
      }
      const hidden = Array.isArray(dp.hiddenPalette)
        ? dp.hiddenPalette.filter((k: unknown) => typeof k === "string" && k.length <= 120).slice(0, 300)
        : [];
      updateData.designerPrefs = { hiddenPalette: hidden };
    }
    // Дефолтный вид цен для новых КП (16.10.2026): detailed | summary. Живёт
    // в kpConfig рядом с остальными настройками КП, остальное там не трогаем.
    if ("kpPriceView" in body) {
      if (!KP_PRICE_VIEWS.includes(body.kpPriceView)) {
        return NextResponse.json({ error: "Неизвестный вид КП" }, { status: 400 });
      }
      const current = await prisma.master.findUnique({ where: { id: master.id }, select: { kpConfig: true } });
      const raw = current?.kpConfig && typeof current.kpConfig === "object" ? (current.kpConfig as Record<string, unknown>) : null;
      // У мастера, который брендинг на сайте не открывал, kpConfig пуст: кладём
      // дефолт шаблона целиком, иначе редактор брендинга получит объект без секций.
      const cfg = raw && Array.isArray(raw.sections) && raw.sections.length > 0
        ? raw
        : { ...(JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG)) as Record<string, unknown>), ...(raw ?? {}) };
      updateData.kpConfig = { ...cfg, priceView: body.kpPriceView };
    }
    if ("language" in body && body.language !== "ru" && body.language !== "kk") {
      return NextResponse.json({ error: "Неизвестный язык" }, { status: 400 });
    }
    if ("currency" in body && !CURRENCY_CODES.includes(body.currency)) {
      return NextResponse.json({ error: "Неизвестная валюта" }, { status: 400 });
    }
    if ("source" in body && !["instagram", "friend", "other"].includes(body.source)) {
      return NextResponse.json({ error: "Неизвестный источник" }, { status: 400 });
    }
    for (const field of allowedFields) {
      if (field in body && !boolFields.includes(field)) {
        updateData[field] = body[field];
      }
    }
    for (const field of intFields) {
      if (field in body) {
        updateData[field] = parseInt(body[field], 10) || 0;
      }
    }
    for (const field of boolFields) {
      if (field in body) {
        updateData[field] = Boolean(body[field]);
      }
    }

    // Телефон и WhatsApp мастера (13.11.2026). Раньше сервер писал строку как прислали: форма
    // сайта приписывала «+7» зарубежным номерам, и «+996 700 123 456» становился «+76700123456»
    // — мастер терял вход (логин ищется по точному номеру в виде +ХХХ…). Теперь:
    //  - номер приводится к этому виду здесь же, одной функцией с формой;
    //  - тот же номер в другой записи («+7 701…» при «+77013330078» в базе) поле не трогает вовсе;
    //  - новый номер должен быть полным номером с кодом страны, иначе 400 и ничего не пишем.
    const current = ("phone" in updateData || "whatsappPhone" in updateData)
      ? (await prisma.master.findUnique({ where: { id: master.id }, select: { phone: true, whatsappPhone: true } })) ?? { phone: master.phone, whatsappPhone: null }
      : { phone: master.phone, whatsappPhone: null };
    for (const field of ["phone", "whatsappPhone"] as const) {
      if (!(field in updateData)) continue;
      const raw = updateData[field];
      const stored = current[field] ?? "";
      // Пустой WhatsApp — «убрать номер»; пустой телефон допустим, только если он и был пуст.
      if (raw === null || raw === "") {
        if (field === "whatsappPhone") updateData[field] = "";
        else if (stored === "") delete updateData[field];
        else return badPhone(field, master.language);
        continue;
      }
      if (typeof raw !== "string") return badPhone(field, master.language);
      const next = normalizeProfilePhone(raw);
      if (raw === stored || next === stored) {
        delete updateData[field];
        continue;
      }
      // Вкладка сайта, открытая до выката, всё ещё портит зарубежный номер на своей стороне:
      // шлёт «+7» + последние 10 цифр того, что в базе. Это не смена номера — не трогаем.
      const storedDigits = stored.replace(/\D/g, "");
      if (!stored.startsWith("+7") && storedDigits.length > 10 && next === `+7${storedDigits.slice(-10)}`) {
        delete updateData[field];
        continue;
      }
      if (normalizeE164(next) !== next) return badPhone(field, master.language);
      updateData[field] = next;
    }

    // Телефон — логин, он уникален: занятый другим аккаунтом номер давал 500 (P2002, прод 11.11.2026).
    // Проверяем заранее и отвечаем понятным 409; гонку двух сохранений ловит catch ниже.
    if (typeof updateData.phone === "string" && updateData.phone !== current.phone) {
      const taken = await prisma.master.findFirst({ where: { phone: updateData.phone, NOT: { id: master.id } }, select: { id: true } });
      if (taken) return phoneTaken(master.language);
    }

    // Смена валюты (11.11.2026): стартовый прайс пересеваем в новую валюту, правленный
    // не трогаем — мастеру уходит одна строка-подсказка. Своя валюта из базы, а не
    // из requireAuth: там у участника бригады уже подставлена валюта владельца.
    const prevCurrency = "currency" in body
      ? (await prisma.master.findUnique({ where: { id: master.id }, select: { currency: true } }))?.currency ?? null
      : null;

    try {
      await prisma.master.update({
        where: { id: master.id },
        data: updateData,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002" && "phone" in updateData) return phoneTaken(master.language);
      throw e;
    }

    let prices: ReseedOutcome = "none";
    if ("currency" in body && prevCurrency !== body.currency) {
      // Валюта уже сохранена; сбой пересева не должен ронять сохранение профиля.
      prices = await reseedPricesOnCurrencyChange(master.id, prevCurrency, body.currency).catch((e) => {
        console.error("reseed prices on currency change:", e);
        return "kept" as const;
      });
    }
    const priceHint = reseedHint(prices, prevCurrency, body.currency, master.language);
    return NextResponse.json({ success: true, prices, ...(priceHint ? { priceHint } : {}) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления профиля" },
      { status: 500 }
    );
  }
}

function badPhone(field: "phone" | "whatsappPhone", language: string | null | undefined) {
  const what = field === "phone" ? (language === "kk" ? "Телефон нөмірін" : "номер телефона") : (language === "kk" ? "WhatsApp нөмірін" : "номер WhatsApp");
  const error = language === "kk"
    ? `${what} тексеріңіз: ел кодымен толық нөмір керек, мысалы +7 701 123 45 67.`
    : `Проверьте ${what}: нужен полный номер с кодом страны, например +7 701 123 45 67.`;
  return NextResponse.json({ error, code: "BAD_PHONE", field }, { status: 400 });
}

function phoneTaken(language: string | null | undefined) {
  const error = language === "kk"
    ? "Бұл нөмір басқа аккаунтқа тіркелген. WhatsApp-қа жазыңыз — біріктіреміз."
    : "Этот номер уже зарегистрирован на другой аккаунт. Напишите нам в WhatsApp — объединим.";
  return NextResponse.json({ error, code: "PHONE_TAKEN" }, { status: 409 });
}
