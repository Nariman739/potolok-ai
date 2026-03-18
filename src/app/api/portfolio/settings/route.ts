import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — получить настройки портфолио
export async function GET() {
  try {
    const master = await requireAuth();

    const data = await prisma.master.findUnique({
      where: { id: master.id },
      select: {
        portfolioSlug: true,
        portfolioBio: true,
        firstName: true,
        companyName: true,
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH — обновить slug и био
export async function PATCH(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { portfolioSlug, portfolioBio } = body;

    // Валидация slug
    if (portfolioSlug !== undefined) {
      const slug = portfolioSlug.trim().toLowerCase();

      if (slug && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
        return NextResponse.json(
          { error: "Slug может содержать только латинские буквы, цифры и дефис" },
          { status: 400 }
        );
      }

      if (slug.length > 0 && slug.length < 3) {
        return NextResponse.json(
          { error: "Минимум 3 символа" },
          { status: 400 }
        );
      }

      // Проверка уникальности
      if (slug) {
        const existing = await prisma.master.findUnique({
          where: { portfolioSlug: slug },
        });
        if (existing && existing.id !== master.id) {
          return NextResponse.json(
            { error: "Этот адрес уже занят" },
            { status: 409 }
          );
        }
      }

      await prisma.master.update({
        where: { id: master.id },
        data: {
          portfolioSlug: slug || null,
          ...(portfolioBio !== undefined && { portfolioBio: portfolioBio || null }),
        },
      });
    } else if (portfolioBio !== undefined) {
      await prisma.master.update({
        where: { id: master.id },
        data: { portfolioBio: portfolioBio || null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Portfolio settings error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
