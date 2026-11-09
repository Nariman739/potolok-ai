import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { priceBookCompanyId } from "@/lib/price-items";
import { createFilm, loadFilms, parseFilmInput } from "@/lib/film-items";

function failure(error: unknown, log: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  console.error(log, error);
  return NextResponse.json({ error: "Не удалось выполнить действие с плёнкой" }, { status: 500 });
}

export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const films = await loadFilms(await priceBookCompanyId(scope.ownerId));
    return NextResponse.json({ films, isOwner: scope.isOwner });
  } catch (error) {
    return failure(error, "Get films error:");
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) return NextResponse.json({ error: "Плёнки в прайс компании добавляет её владелец" }, { status: 403 });
    const input = parseFilmInput(await request.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    const film = await createFilm(await priceBookCompanyId(scope.ownerId), input);
    if (film === "duplicate") return NextResponse.json({ error: "Плёнка с таким названием уже есть" }, { status: 409 });
    return NextResponse.json({ film });
  } catch (error) {
    return failure(error, "Create film error:");
  }
}
