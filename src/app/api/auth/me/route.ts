import { NextResponse } from "next/server";
import { getCurrentMaster } from "@/lib/auth";

export async function GET() {
  try {
    const master = await getCurrentMaster();
    if (!master) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }
    return NextResponse.json(master);
  } catch (error) {
    console.error("Get me error:", error);
    return NextResponse.json(
      { error: "Ошибка получения данных" },
      { status: 500 }
    );
  }
}
