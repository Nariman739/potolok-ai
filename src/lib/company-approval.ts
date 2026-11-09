import { prisma } from "./prisma";
import { sendPushToMaster } from "./push";
import { sendTelegramMessage } from "./telegram";

/**
 * Подтверждение владельцем при вступлении в компанию (09.11.2026).
 *
 * Регистрация не проверяет номер, а приглашение привязывается по номеру: кто первым
 * зарегистрировался на номер приглашённого, тот мог принять приглашение и увидеть базу
 * компании. Теперь «Принять» — это заявка (Member.pendingSince), доступ открывает владелец.
 */

const PUSH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type Lang = string | null | undefined;

export function pendingApprovalText(language: Lang): string {
  return language === "kk"
    ? "Өтінім иесіне жіберілді. Қолжетімділік ол растағаннан кейін ашылады."
    : "Заявка отправлена владельцу. Доступ откроется после подтверждения.";
}

export function bringDataBlockedText(language: Lang): string {
  return language === "kk"
    ? "Сіздің компанияңызда басқа адамдар жұмыс істейді — деректерді көшіру мүмкін емес. Шақыруды көшірусіз қабылдаңыз."
    : "В вашей компании работают другие люди — перенести данные нельзя. Примите приглашение без переноса.";
}

/** Владельцу — о новой заявке. Атомарно, не чаще раза в сутки по одной строке (цикл «заявка → отзыв»). */
export async function notifyOwnerOfRequest(memberId: string): Promise<void> {
  try {
    const threshold = new Date(Date.now() - PUSH_INTERVAL_MS);
    const claim = await prisma.member.updateMany({
      where: { id: memberId, OR: [{ approvalPushAt: null }, { approvalPushAt: { lt: threshold } }] },
      data: { approvalPushAt: new Date() },
    });
    if (claim.count === 0) return;
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        master: { select: { firstName: true, lastName: true, phone: true } },
        company: { select: { name: true, owner: { select: { id: true, language: true, telegramChatId: true } } } },
      },
    });
    if (!m?.master) return;
    const owner = m.company.owner;
    const who = `${[m.master.firstName, m.master.lastName].filter(Boolean).join(" ").slice(0, 60)}, ${m.master.phone}`;
    const kk = owner.language === "kk";
    const title = kk ? "Қызметкерді растаңыз" : "Подтвердите сотрудника";
    const body = kk
      ? `${who} «${m.company.name}» компаниясына кіруді сұрайды. «Адамдар» бөлімінде немесе potolok.ai сайтында растаңыз, не қосымшаны жаңартыңыз.`
      : `${who} просит доступ к «${m.company.name}». Подтвердите в «Людях», на potolok.ai или обновите приложение.`;
    await sendPushToMaster(owner.id, { title, body, data: { screen: "/company" } });
    if (owner.telegramChatId) {
      await sendTelegramMessage(owner.telegramChatId, `${title}\n\n${body}`).catch((e) => console.warn("approval telegram:", e));
    }
  } catch (e) {
    // Уведомление не должно ронять заявку: она и так видна владельцу в «Людях» и на плашке.
    console.warn("notifyOwnerOfRequest:", e);
  }
}

/** Приглашённому — решение владельца. */
export async function notifyMemberOfDecision(
  masterId: string,
  language: Lang,
  companyName: string,
  d: { approved: false } | { approved: true; movedIn: boolean; transferSkipped: boolean },
): Promise<void> {
  const kk = language === "kk";
  let title: string;
  let body: string;
  if (!d.approved) {
    title = kk ? `Иесі «${companyName}» өтінімін растамады` : `Владелец не подтвердил заявку в «${companyName}»`;
    body = kk ? "Сіздің деректеріңіз өзгерген жоқ." : "Ваши данные не изменились.";
  } else {
    title = kk ? `Сіз «${companyName}» компаниясында расталдыңыз` : `Вас подтвердили в «${companyName}»`;
    if (!d.movedIn) {
      body = kk
        ? "Сіз басқа компанияда жұмыс істеп жатырсыз, сондықтан ауыстырмадық. Өту үшін басты экрандағы шақыруды қабылдаңыз."
        : "Вы работаете в другой компании, поэтому мы вас не переключили. Чтобы перейти, примите приглашение на главном экране.";
    } else {
      body = kk ? "Компания объектілері мен клиенттері енді қолжетімді." : "Объекты и клиенты компании теперь доступны.";
      if (d.transferSkipped) {
        body += kk
          ? " Сіздің деректеріңіз көшірілмеді, олар өзіңізде қалды: компанияңызда басқа адамдар жұмыс істейді."
          : " Ваши данные не перенесены и остались у вас: в вашей компании работают другие люди.";
      }
    }
  }
  await sendPushToMaster(masterId, { title, body, data: { screen: "/(tabs)/today" } });
}
