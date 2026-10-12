import { getOwnerLegalInfo } from "@/lib/owner";
import { LegalArticle } from "../legal-article";

export const metadata = {
  title: "Контакты — PotolokAI",
  description: "Контакты и реквизиты сервиса PotolokAI",
};

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const o = await getOwnerLegalInfo();
  return (
    <LegalArticle title="Контакты">
      <p>
        PotolokAI делает один человек — мастер натяжных потолков из Астаны. Поэтому поддержка
        отвечает лично и обычно быстро: в рабочие дни в течение нескольких часов.
      </p>

      <h2>Поддержка</h2>
      <ul>
        <li><b>WhatsApp / телефон:</b> {o.phone}</li>
        <li><b>Email:</b> {o.email}</li>
        <li><b>Telegram-бот:</b> <a href="https://t.me/potolokaiBot" target="_blank" rel="noopener noreferrer">@potolokaiBot</a></li>
      </ul>

      <h2>Реквизиты</h2>
      <ul>
        <li><b>Исполнитель:</b> {o.legalName}</li>
        {o.bin && <li><b>БИН:</b> {o.bin}</li>}
        {!o.bin && o.iin && <li><b>ИИН:</b> {o.iin}</li>}
        <li><b>Адрес:</b> {o.legalAddress}</li>
        {o.bankName && o.iban && <li><b>Банк:</b> {o.bankName}, IBAN {o.iban}</li>}
      </ul>

      <h2>Документы</h2>
      <ul>
        <li><a href="/terms">Публичный договор-оферта</a></li>
        <li><a href="/refund">Возврат оплаты и отмена подписки</a></li>
        <li><a href="/privacy">Политика конфиденциальности</a></li>
        <li><a href="/pricing">Тарифы</a></li>
      </ul>
    </LegalArticle>
  );
}
