import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectPayment, notifyUserAboutPaymentDecision } from "@/lib/payment";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireAuth();
    const owner = await prisma.master.findUnique({
      where: { id: me.id },
      select: { isOwner: true },
    });
    if (!owner?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const notes = (body?.notes ?? "").toString().trim() || undefined;

    const result = await rejectPayment({ paymentId: id, adminId: me.id, notes });

    notifyUserAboutPaymentDecision({
      master: result.master,
      payment: result.payment,
      approved: false,
    }).catch((err) => console.error("notifyUserAboutPaymentDecision failed:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Admin payment reject error:", error);
    return NextResponse.json({ error: "Ошибка отклонения" }, { status: 500 });
  }
}
