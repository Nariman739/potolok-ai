/**
 * Разбор ответа клиента на «Данные для договора» (30.09.2026).
 *
 * Клиент пишет как умеет: «Ахметова Гульмира Сериковна, Кабанбай батыра 11
 * кв 45, ИИН 850101400123». Сначала надёжное регулярками (ИИН — 12 цифр,
 * телефон), потом помощник раскладывает имя и адрес. Модель недоступна —
 * отдаём то, что нашли регулярками, мастер допишет руками.
 */
import { getOpenRouter, AI_MODEL } from "./openrouter";

export type ClientData = { fullName: string | null; address: string | null; iin: string | null; phone: string | null };

export function findIin(text: string): string | null {
  const m = text.replace(/[\s-]/g, " ").match(/(?<!\d)(\d{12})(?!\d)/) ?? text.match(/(?<!\d)(\d{6})[\s-]?(\d{6})(?!\d)/);
  if (!m) return null;
  return m[2] ? m[1] + m[2] : m[1];
}

export function findPhone(text: string): string | null {
  const m = text.match(/(?:\+?7|8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return "+7" + digits.slice(-10);
}

export async function parseClientData(text: string): Promise<ClientData> {
  const iin = findIin(text);
  const phone = findPhone(text);
  let fullName: string | null = null;
  let address: string | null = null;
  try {
    const completion = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            'Из сообщения клиента в Казахстане достань данные для договора. Верни ТОЛЬКО JSON: {"fullName": "Фамилия Имя Отчество как написал клиент или null", "address": "адрес объекта полностью: город, улица, дом, квартира — или null"}. Ничего не придумывай. ИИН и телефон в адрес и имя не включай.',
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
      max_tokens: 300,
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { fullName?: unknown; address?: unknown };
    if (typeof json.fullName === "string" && json.fullName.trim().length >= 2) fullName = json.fullName.trim().slice(0, 150);
    if (typeof json.address === "string" && json.address.trim().length >= 3) address = json.address.trim().slice(0, 300);
  } catch (e) {
    console.warn("client-data AI parse failed:", e instanceof Error ? e.message : e);
  }
  return { fullName, address, iin, phone };
}
