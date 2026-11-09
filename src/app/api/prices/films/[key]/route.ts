import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { priceBookCompanyId } from "@/lib/price-items";
import { deleteFilm, parseFilmInput, updateFilm } from "@/lib/film-items";

type Ctx = { params: Promise<{ key: string }> };

function failure(error: unknown, log: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  console.error(log, error);
  return NextResponse.json({ error: "Не удалось выполнить действие с плёнкой" }, { status: 500 });
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) return NextResponse.json({ error: "Плёнки в прайсе компании меняет её владелец" }, { status: 403 });
    const input = parseFilmInput(await request.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    const { key } = await params;
    const film = await updateFilm(await priceBookCompanyId(scope.ownerId), key, input);
    if (film === "missing") return NextResponse.json({ error: "Плёнка не найдена" }, { status: 404 });
    if (film === "duplicate") return NextResponse.json({ error: "Плёнка с таким названием уже есть" }, { status: 409 });
    return NextResponse.json({ film });
  } catch (error) {
    return failure(error, "Update film error:");
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) return NextResponse.json({ error: "Плёнки в прайсе компании меняет её владелец" }, { status: 403 });
    const { key } = await params;
    const done = await deleteFilm(await priceBookCompanyId(scope.ownerId), key);
    return done ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Плёнка не найдена" }, { status: 404 });
  } catch (error) {
    return failure(error, "Delete film error:");
  }
}
