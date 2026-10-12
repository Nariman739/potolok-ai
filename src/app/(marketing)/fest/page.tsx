import { redirect } from "next/navigation";

/**
 * Потолок Фест 2026 прошёл (18–19 июня). Промокод FEST2026 больше не действует,
 * лендинг феста удалён (12.10.2026) — старые ссылки и QR ведут на главную.
 * Страница /fest/install (QR на установку приложения) живёт отдельно.
 */
export default function FestPage() {
  redirect("/");
}
