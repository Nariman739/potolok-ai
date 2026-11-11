import path from "path";
import { open, BASE, state } from "../status/lib.mjs";
const { browser, page } = await open(1366);
await page.goto(`${BASE}/dashboard/clients/${state.created.clientId}`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(process.env.HOME, "Desktop", "веб-статус-этап-2", "after", "1366-карточка-история.png") });
console.log("этап на карточке:", await page.locator("[data-stage]").getAttribute("data-stage"), "| событие в истории:", await page.getByText("Этап: «КП отправлено» → «Завершён»").count());
await browser.close();
