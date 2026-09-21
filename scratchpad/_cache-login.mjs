// Подключается через `node --import ./scratchpad/_cache-login.mjs test-*.mjs`.
// Тесты логинятся каждый сам; шесть прогонов подряд упирались в лимит входов (429 на 7 минут).
// Здесь ответ /auth/login кэшируется на 6 часов по паре «сервер + телефон».
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const FILE = fileURLToPath(new URL("./.qa-login-cache.json", import.meta.url));
const TTL = 6 * 60 * 60 * 1000;
const load = () => { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.endsWith("/auth/login") || (init?.method ?? "GET") !== "POST") return realFetch(input, init);
  let phone = ""; try { phone = JSON.parse(init.body).phone; } catch {}
  const key = `${url}|${phone}`;
  const cache = load();
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", "set-cookie": hit.cookie } });
  const res = await realFetch(input, init);
  const cookie = res.headers.get("set-cookie");
  const body = await res.clone().text();
  if (res.ok && cookie) { cache[key] = { at: Date.now(), cookie, body }; writeFileSync(FILE, JSON.stringify(cache)); }
  return res;
};
