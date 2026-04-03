import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { PRODUCT_ITEMS } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток регистрации. Попробуйте через час." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { phone: rawPhone, password, firstName, companyName } = body;

    if (!rawPhone || !password || !firstName) {
      return NextResponse.json(
        { error: "Телефон, пароль и имя обязательны" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json(
        { error: "Неверный формат телефона. Пример: +7 700 123 4567" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль минимум 6 символов" },
        { status: 400 }
      );
    }

    const existing = await prisma.master.findUnique({ where: { phone } });
    if (existing) {
      return NextResponse.json(
        { error: "Этот номер уже зарегистрирован" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Авто-генерация slug для портфолио
    const baseSlug = (firstName || "master")
      .toLowerCase()
      .replace(/[а-яё]/g, (c: string) => {
        const map: Record<string, string> = {
          а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",
          к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
          х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
        };
        return map[c] || c;
      })
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let portfolioSlug = baseSlug;
    let suffix = 1;
    while (await prisma.master.findUnique({ where: { portfolioSlug } })) {
      portfolioSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const master = await prisma.master.create({
      data: {
        phone,
        passwordHash,
        firstName,
        companyName: companyName || null,
        portfolioSlug,
        prices: {
          create: PRODUCT_ITEMS.map((item) => ({
            itemCode: item.code,
            price: item.defaultPrice,
          })),
        },
      },
    });

    await createSession(master.id);

    return NextResponse.json({
      id: master.id,
      phone: master.phone,
      firstName: master.firstName,
      companyName: master.companyName,
    });
  } catch (error) {
    console.error("Register error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Ошибка регистрации" },
      { status: 500 }
    );
  }
}
