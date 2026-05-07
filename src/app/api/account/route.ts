import { NextResponse } from "next/server";
import { requireAuth, deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  try {
    const master = await requireAuth();

    await prisma.master.delete({ where: { id: master.id } });

    try {
      await deleteSession();
    } catch {
      // session cookie may already be gone — игнорим
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Не удалось удалить аккаунт" },
      { status: 500 }
    );
  }
}
