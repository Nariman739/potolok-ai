import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runVisionAgents } from "@/lib/vision-agents";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";

// 7 MB upper bound on the base64-encoded payload. 7 MB base64 ≈ 5 MB binary —
// fits all realistic phone photos but blocks gigabyte abuse.
const MAX_PAYLOAD_BYTES = 7 * 1024 * 1024;
// Per-master throttle: 20 vision runs per hour. Each run fans out to 3
// OpenRouter agents — without this an abusive client can drain the budget.
const MAX_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  let master;
  try {
    master = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`vision:${master.id}`, MAX_PER_HOUR, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком часто. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const budget = await checkAiBudget(master.id, masterRole(master));
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "AI daily limit reached", remaining: 0, resetAt: budget.resetAt },
      { status: 429 },
    );
  }

  // Reject oversized payloads cheaply, before parsing JSON.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Фото слишком большое (максимум 5 МБ)" }, { status: 413 });
  }

  try {
    const body = await request.json();
    const { imageBase64Url } = body as { imageBase64Url: string };

    if (!imageBase64Url || typeof imageBase64Url !== "string") {
      return NextResponse.json({ error: "Отправьте фото" }, { status: 400 });
    }
    if (imageBase64Url.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Фото слишком большое (максимум 5 МБ)" }, { status: 413 });
    }

    const result = await runVisionAgents(imageBase64Url);
    await recordAiUsage(master.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Vision test error:", error);
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
