import { NextResponse } from "next/server";
import { publishScheduledPosts } from "@/lib/instagram-publisher";

// Vercel Cron: runs at key posting hours (UTC → Astana UTC+6)
// 01:00 UTC = 07:00 Astana, 06:00 = 12:00, 12:00 = 18:00
export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const published = await publishScheduledPosts();
    console.log(`[Cron] Instagram: published ${published} posts`);
    return NextResponse.json({ ok: true, published });
  } catch (error) {
    console.error("[Cron] Instagram publish error:", error);
    return NextResponse.json({ ok: false, error: "Publish failed" }, { status: 500 });
  }
}
