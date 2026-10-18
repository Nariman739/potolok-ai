import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToMaster } from "@/lib/push";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Пуш-цепочка новичку «зарегистрировался, но не замерил» (18.10.2026).
 * Раз в час (vercel.json "0 * * * *").
 *
 * Зачем: 16.10 — 30 регистраций / 8 замеров, 17.10 — 34 / 8. Три четверти
 * новичков ставят приложение и не делают ни одного объекта. Напоминаем три
 * раза: через 2 часа (пробный замер своей комнаты), на следующий день и
 * через 3 дня. Мастеру, который сделал хотя бы один объект, ничего не шлём —
 * проверяем в момент отправки, а не заранее.
 *
 * Дубли: таблица OnboardingPush, уникальность (masterId, step). Строку
 * создаём ДО отправки — два параллельных запуска не отправят один шаг дважды.
 *
 * Тихие часы Алматы 21:00–09:00: не шлём, кандидаты дождутся следующего
 * часа. Окна шагов шире «идеальных» (h2 — 2…18 ч, а не 2…6), иначе тот, кто
 * зарегистрировался вечером, вообще не получил бы первый шаг: к 09:00 утра
 * ему уже 14 часов. Чтобы после ночи два шага не пришли подряд, между
 * любыми двумя шагами одному мастеру — не меньше 12 часов.
 *
 * Тексты без имён, телефонов и адресов: пуш виден на заблокированном экране.
 * Слово «бесплатно» не используем (решение 11.10.2026).
 *
 * ?dry=1 — посчитать кандидатов, ничего не слать и не записывать.
 */
export const maxDuration = 60;

const HOUR_MS = 60 * 60 * 1000;
const ALMATY_OFFSET_H = 5;
const QUIET_FROM_H = 21;
const QUIET_TO_H = 9;
/** Минимальный зазор между двумя шагами одному мастеру. */
const MIN_GAP_MS = 12 * HOUR_MS;

type Step = "h2" | "d1" | "d3";
type Lang = "ru" | "kk";

const STEPS: { step: Step; minAgeH: number; maxAgeH: number }[] = [
  { step: "h2", minAgeH: 2, maxAgeH: 18 },
  { step: "d1", minAgeH: 20, maxAgeH: 44 },
  { step: "d3", minAgeH: 68, maxAgeH: 96 },
];

const TEXTS: Record<Step, Record<Lang, { title: string; body: string }> & { screen: string }> = {
  h2: {
    screen: "/(tabs)/measurements?start=1&practice=1",
    ru: {
      title: "Попробуй замер за 2 минуты",
      body: "Замерь свою комнату — приложение само дочертит план и посчитает КП. Это пробный объект, клиенту не уйдёт.",
    },
    kk: {
      title: "2 минутта өлшеп көр",
      body: "Өз бөлмеңді өлше — қолданба жоспарды өзі сызып, КП-ны есептейді. Бұл сынақ нысан, клиентке кетпейді.",
    },
  },
  d1: {
    screen: "/(tabs)/objects",
    ru: {
      title: "Первый замер ещё не сделан",
      body: "Открой приложение, начни замер — голосом или по фото комнаты. Если что-то непонятно, напиши нам в Telegram @potolokaiBot.",
    },
    kk: {
      title: "Алғашқы өлшем әлі жасалмады",
      body: "Қолданбаны аш, өлшеуді баста — дауыспен немесе бөлме фотосы арқылы. Түсініксіз болса, Telegram-да @potolokaiBot-қа жаз.",
    },
  },
  d3: {
    screen: "/(tabs)/assistant",
    ru: {
      title: "Нужна помощь с первым замером?",
      body: "Ответь на это сообщение или напиши в @potolokaiBot — покажем на твоём объекте.",
    },
    kk: {
      title: "Алғашқы өлшемге көмек керек пе?",
      body: "Осы хабарламаға жауап бер немесе @potolokaiBot-қа жаз — өз нысаныңда көрсетеміз.",
    },
  },
};

/** QA-аккаунты и тестовые регистрации — им цепочка не нужна. */
const QA_PHONES = ["+77000000077", "+77000000078", "+77000000079", "+77000000099"];
const QA_NAME_PATTERNS = ["qa", "test", "тест"];

function isQa(m: { phone: string; firstName: string; companyName: string | null; source: string | null }): boolean {
  if (QA_PHONES.includes(m.phone)) return true;
  const hay = `${m.firstName} ${m.companyName ?? ""} ${m.source ?? ""}`.toLowerCase();
  return QA_NAME_PATTERNS.some((p) => hay.includes(p));
}

function almatyHour(now: Date): number {
  return (now.getUTCHours() + ALMATY_OFFSET_H) % 24;
}

function isQuietHours(now: Date): boolean {
  const h = almatyHour(now);
  return h >= QUIET_FROM_H || h < QUIET_TO_H;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const now = new Date();
  const quiet = isQuietHours(now);

  const report: { step: Step; candidates: number; sent: number; skippedQuiet: number; dry: boolean }[] = [];

  for (const { step, minAgeH, maxAgeH } of STEPS) {
    const from = new Date(now.getTime() - maxAgeH * HOUR_MS);
    const to = new Date(now.getTime() - minAgeH * HOUR_MS);

    // Кандидаты: зарегистрирован в окне шага, ни одного объекта, есть куда
    // слать (живое устройство или Telegram), этот шаг ещё не отправляли.
    const masters = await prisma.master.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        measurements: { none: {} },
        onboardingPushes: { none: { step } },
        OR: [{ pushDevices: { some: { disabledAt: null } } }, { telegramChatId: { not: null } }],
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        companyName: true,
        source: true,
        language: true,
        telegramChatId: true,
        onboardingPushes: { select: { sentAt: true }, orderBy: { sentAt: "desc" }, take: 1 },
      },
      take: 500,
    });

    const candidates = masters.filter((m) => {
      if (isQa(m)) return false;
      const last = m.onboardingPushes[0]?.sentAt;
      if (last && now.getTime() - last.getTime() < MIN_GAP_MS) return false;
      return true;
    });

    let sent = 0;
    let skippedQuiet = 0;

    for (const m of candidates) {
      if (quiet) {
        skippedQuiet++;
        continue;
      }
      if (dry) continue;

      // Заявка на шаг. Уникальный индекс не даст двум запускам отправить
      // одно и то же: второй упадёт на P2002 и пропустит мастера.
      try {
        await prisma.onboardingPush.create({ data: { masterId: m.id, step } });
      } catch {
        continue;
      }

      const lang: Lang = m.language === "kk" ? "kk" : "ru";
      const text = TEXTS[step][lang];
      const msg = { title: text.title, body: text.body, data: { screen: TEXTS[step].screen } };

      // Vercel: без await промис не доживает до отправки.
      const delivered = await sendPushToMaster(m.id, msg);
      if (m.telegramChatId) {
        await sendTelegramMessage(m.telegramChatId, `<b>${msg.title}</b>\n${msg.body}`).catch(() => {});
      }
      console.log(`onboarding-push ${step}: master ${m.id} devices=${delivered} tg=${m.telegramChatId ? 1 : 0}`);
      sent++;
    }

    report.push({ step, candidates: candidates.length, sent, skippedQuiet, dry });
  }

  console.log("onboarding-pushes:", JSON.stringify({ quiet, almatyHour: almatyHour(now), report }));
  return NextResponse.json({ quiet, almatyHour: almatyHour(now), steps: report });
}
