import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getActionableClients } from "@/lib/clients";

// Лента "Что делать сегодня" на главном экране клиентов mobile.
// Возвращает три бакета: overdue / today / tomorrow по полю nextContactAt
// (Asia/Almaty). WON/LOST исключены.
export async function GET() {
  try {
    const master = await requireAuth();
    const buckets = await getActionableClients(master.id);
    return NextResponse.json(buckets);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get actionable clients error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки списка действий" },
      { status: 500 },
    );
  }
}
