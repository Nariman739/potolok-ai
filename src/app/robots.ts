import type { MetadataRoute } from "next";

/**
 * robots.txt (13.11.2026; раньше отдавался 404).
 *
 * Главная и маркетинг открыты. Закрыты кабинет и API.
 *
 * Документы заказчика (/n, /z, /kp, /contract, /act, /visual) здесь НЕ
 * перечислены намеренно: закрытую в robots.txt страницу поисковик не скачивает,
 * значит не видит `noindex` и может показать её в выдаче голым адресом — а адрес
 * с токеном и есть доступ к документу. Их закрывают metadata.robots (DOC_ROBOTS)
 * и заголовок X-Robots-Tag из next.config.ts.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/"] }],
  };
}
