import { proxyToExpo } from "@/lib/eas-proxy";

// Манифест EAS Update через potolok.ai → u.expo.dev/<projectId> (см. src/lib/eas-proxy.ts).
// Сюда ведёт rewrite с /<projectId> (next.config.ts): для приложения
// updates.url = https://potolok.ai/<projectId>, как требует eas-cli.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EAS_PROJECT_ID = "6823c39a-b031-4e6c-945e-39a2d1d06c51";

function handle(request: Request) {
  // Не похоже на expo-updates (нет платформы/рантайма) — 404, это не публичный URL.
  if (!request.headers.get("expo-platform") || !request.headers.get("expo-runtime-version")) {
    return new Response(null, { status: 404 });
  }
  const { search } = new URL(request.url);
  return proxyToExpo(request, `https://u.expo.dev/${EAS_PROJECT_ID}${search}`, "manifest");
}

export const GET = handle;
export const HEAD = handle;
