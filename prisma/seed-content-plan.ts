// Seed for ContentPlan — 48 themes:
//   8 Master Class (full briefs, series="master-class")
//   5 Fest-2026 (full briefs, series="fest-2026", scheduledFor pinned)
//  12 Wow killer features (full briefs)
//  23 Skeletons (hook + 1-2 shots; LLM enriches on cp_shoot_*)
//
// Run: npx tsx prisma/seed-content-plan.ts
//
// Idempotency: uses upsertable composite key (series+seriesOrder OR title for non-series).

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { ContentBrief } from "../src/lib/content-plan-types";

type FeatureName =
  | "ONBOARDING"
  | "TECH_PASSPORT_AI"
  | "MEASUREMENT"
  | "BLE_RULER"
  | "CONSTRUCTOR_3D"
  | "KP"
  | "CONTRACT"
  | "CRM"
  | "PRICE_LIST"
  | "PORTFOLIO"
  | "GENERAL";

type FormatName = "REELS" | "CAROUSEL" | "POST";
type AudienceName = "MASTERS" | "CLIENTS" | "BOTH";

interface SeedTheme {
  title: string;
  feature: FeatureName;
  format: FormatName;
  audience: AudienceName;
  priority: number;
  brief: ContentBrief;
  isBriefSkeleton?: boolean;
  series?: string;
  seriesOrder?: number;
  scheduledFor?: Date;
  releaseTag?: string;
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const KZ_TAGS = ["#астана", "#потолкиастана", "#ремонтастана"];
const COMMON_TAGS = ["#натяжныепотолки", "#ремонт", "#дизайнинтерьера"];
const TECH_NOTE = "Запиши через iOS Control Center → Запись экрана. Готовое видео — AirDrop на Mac для монтажа.";

function tags(...niche: string[]): string[] {
  return [...COMMON_TAGS.slice(0, 2), ...niche, ...KZ_TAGS.slice(0, 2)];
}

// ─────────────────────────────────────────────────────
// MASTER CLASS (8 themes, series order 1-8)
// ─────────────────────────────────────────────────────

const masterClass: SeedTheme[] = [
  {
    title: "Регистрация и первый вход за 60 секунд",
    feature: "ONBOARDING",
    format: "REELS",
    audience: "MASTERS",
    priority: 80,
    series: "master-class",
    seriesOrder: 1,
    brief: {
      hook: "Скачал PotolokAI — и через минуту уже считаешь КП. Без логинов, без паролей, без боли.",
      problem: "Новые приложения для мастеров обычно — это 10 минут на регистрацию и подтверждение.",
      solution: "В PotolokAI ввёл номер телефона — и всё. Без email, без паролей, без капчи.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Открываем App Store, тапаем «Загрузить»", overlayText: "PotolokAI" },
        { order: 2, type: "screen_recording", durationSec: 6, description: "Вводим номер +7, получаем SMS, входим" },
        { order: 3, type: "screen_recording", durationSec: 6, description: "Главный экран — мастер на месте, всё готово", overlayText: "Готово!" },
      ],
      voiceOver: "Скачал, ввёл номер, получил код. 60 секунд — и ты внутри. Никаких email-подтверждений и паролей. Так должно быть в 2026 году.",
      cta: "Скачай в App Store — ссылка в био",
      hashtagsHint: tags("#онбординг", "#потолкимастер"),
      coverIndex: 2,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Заводим первого клиента и проект",
    feature: "CRM",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 75,
    series: "master-class",
    seriesOrder: 2,
    brief: {
      hook: "Звонок от клиента — пока разговариваешь, заводишь его в CRM. Никаких блокнотов.",
      problem: "У большинства мастеров клиенты живут в WhatsApp или в голове. Потом не вспомнить с кем о чём договорился.",
      solution: "В PotolokAI: + → Клиент, имя, телефон, адрес. Всё. Дальше можно приклеить замер, КП, договор.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Таб «Клиенты», тап на «+»" },
        { order: 2, type: "screen_recording", durationSec: 6, description: "Заполняем имя, телефон, адрес через автокомплит 2ГИС" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Карточка клиента готова, видны статусы воронки" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Тап «Позвонить» — открывается звонилка" },
      ],
      voiceOver: "Каждый клиент — это карточка с историей. Звонки, встречи, КП, договор — всё прицеплено к одному месту. Через год вернётся — найдёшь за 3 секунды.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#crm", "#мастер"),
      coverIndex: 2,
      durationSec: 25,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Замеряем комнату в Wall Wizard за 2 минуты",
    feature: "MEASUREMENT",
    format: "REELS",
    audience: "MASTERS",
    priority: 80,
    series: "master-class",
    seriesOrder: 3,
    brief: {
      hook: "Замер обычной кухни — 2 минуты. Без листков, без рулетки в зубах, без переписывания.",
      problem: "Замеры на бумажке — это +20 минут потом, чтобы перенести в Excel и пересчитать.",
      solution: "Wall Wizard: рисуешь стены пальцем, вводишь длины — комната готова, 3D-превью сразу.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Открываем «Новый замер», даём название" },
        { order: 2, type: "screen_recording", durationSec: 8, description: "Рисуем 4 стены пальцем, numpad открывается" },
        { order: 3, type: "screen_recording", durationSec: 6, description: "Вводим длины, видим как комната замыкается" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "3D-превью — комната готова" },
      ],
      voiceOver: "Открываешь замер. Рисуешь стены пальцем — как в детстве. Вводишь цифры. Готово. 3D-превью комнаты прямо в приложении.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#замер", "#натяжныепотолкимастер"),
      coverIndex: 3,
      durationSec: 25,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Подключаем BLE-рулетку через QR-код",
    feature: "BLE_RULER",
    format: "REELS",
    audience: "MASTERS",
    priority: 90,
    series: "master-class",
    seriesOrder: 4,
    brief: {
      hook: "Лазерная рулетка → камера телефона → QR-код → она в приложении. 10 секунд.",
      problem: "Большинство BLE-рулеток требуют установить Mi Home, выгрести оттуда токен — это полчаса возни.",
      solution: "Мы сделали QR-онбординг. Сканируешь QR на рулетке — и она в приложении. Без танцев с Mi Home.",
      shotList: [
        { order: 1, type: "object_closeup", durationSec: 3, description: "Достаём рулетку Xiaomi из коробки" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Профиль → «Подключить рулетку» → камера открывается" },
        { order: 3, type: "phone_camera", durationSec: 4, description: "Сканируем QR-код на рулетке" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Рулетка подключена, появилась в Wall Wizard", overlayText: "✅" },
      ],
      voiceOver: "Лазерная рулетка Xiaomi плюс камера телефона плюс QR-код. Десять секунд — и снимаешь замеры одним тапом по рулетке. Серьёзно — десять.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#blerulet", "#лазернаярулетка"),
      coverIndex: 3,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Конструируем потолок: софиты, треки, парящий",
    feature: "CONSTRUCTOR_3D",
    format: "REELS",
    audience: "BOTH",
    priority: 85,
    series: "master-class",
    seriesOrder: 5,
    brief: {
      hook: "Не описываешь клиенту парящий потолок словами — показываешь. 3D-превью прямо при нём.",
      problem: "Клиент не понимает что такое «парящий с подсветкой» пока не покажешь. Объяснять на пальцах — терять время.",
      solution: "3D-конструктор: тапаешь стену, выбираешь «парящий» — подсветка по периметру в реальном времени. Добавляешь софиты — сразу видно где будут лампочки.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 5, description: "Открываем готовый замер → «Конструктор»" },
        { order: 2, type: "screen_recording", durationSec: 6, description: "Тапаем периметр → выбираем «Парящий» → подсветка появилась" },
        { order: 3, type: "screen_recording", durationSec: 5, description: "Добавляем 6 софитов, выравниваем равномерно" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Финальное 3D с подсветкой" },
      ],
      voiceOver: "Клиент сидит рядом. Тапаешь — парящий потолок. Тапаешь — софиты на местах. Подсветка работает. Клиент видит и говорит «беру». Конец продажи.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#3dконструктор", "#парящийпотолок"),
      coverIndex: 3,
      durationSec: 25,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Считаем КП и отправляем клиенту по ссылке",
    feature: "KP",
    format: "REELS",
    audience: "MASTERS",
    priority: 85,
    series: "master-class",
    seriesOrder: 6,
    brief: {
      hook: "От замера до КП в WhatsApp клиенту — 3 минуты. Не 3 часа, как в Excel.",
      problem: "Считать КП вручную = час времени и куча ошибок. А клиент ждёт «скиньте на ватсап».",
      solution: "После замера и конструктора КП считается само. Тап «Поделиться» → ссылка → клиент открывает на телефоне.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Готовый замер → «Сформировать КП»" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Таблица материалов и работ, цены подтянулись из прайса" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Тап «Отправить клиенту» → ссылка скопирована" },
        { order: 4, type: "phone_camera", durationSec: 4, description: "Клиент открывает ссылку на своём телефоне — красивая КП" },
      ],
      voiceOver: "Замер — КП — отправить. Три тапа. Клиент получает не PDF на 12 страниц, а живую страницу с фото вариантов и итогами. Считает сам — берёт сам.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#кп", "#коммерческоепредложение"),
      coverIndex: 3,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Делаем договор с электронной подписью на телефоне",
    feature: "CONTRACT",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 75,
    series: "master-class",
    seriesOrder: 7,
    brief: {
      hook: "Договор подписан на телефоне клиента. Без печати, без принтера, без приезда в офис.",
      problem: "Распечатать договор → клиент должен прийти подписать → или ты везёшь домой. Терять час на ровном месте.",
      solution: "Из КП тапаешь «Сформировать договор» → клиент открывает ссылку → пишет ФИО, ставит галочку — подписано.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "В сохранённом КП тап «Создать договор»" },
        { order: 2, type: "screen_recording", durationSec: 4, description: "Договор сгенерирован, ссылка на potolok.ai/contract/...", overlayText: "ссылка готова" },
        { order: 3, type: "phone_camera", durationSec: 5, description: "Клиент открывает, читает, ставит галочку, вводит ФИО" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "У мастера: «Договор подписан ✓» с датой и IP" },
      ],
      voiceOver: "КП — договор — клиент подписал. Сидя в кафе. Это легально по новому закону Казахстана о электронной подписи — ФИО плюс галочка плюс IP. Бумажки не нужны.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#договор", "#электроннаяподпись"),
      coverIndex: 3,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Ведём клиента в mini-CRM по воронке",
    feature: "CRM",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 70,
    series: "master-class",
    seriesOrder: 8,
    brief: {
      hook: "Лид → Замер → КП → Договор → Готово. Видишь где застрял каждый клиент.",
      problem: "У мастера 30 активных лидов и без CRM половина забывается. «Тот в красном свитере вроде звонил, надо перезвонить»...",
      solution: "Mini-CRM: видишь воронку, тапаешь статус — переводишь лид. Кнопки звонок/whatsapp/встреча — отмечаешь действие за секунду.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Таб «Клиенты», вид «Воронка»" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Колонки: Новый / Замер / КП / Договор / Завершено" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Тапаем клиента → переносим из «КП» в «Договор»" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Быстрые события: WhatsApp, Звонок, Встреча — тап = в timeline" },
      ],
      voiceOver: "Воронка показывает где теряются клиенты. Половина отвалилась на КП — значит дело в цене. Половина после замера — значит надо звонить через день. Без воронки этого не увидишь.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#crm", "#воронка"),
      coverIndex: 1,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
];

// ─────────────────────────────────────────────────────
// FEST-2026 (5 themes, scheduledFor pinned to fest dates)
// ─────────────────────────────────────────────────────

const fest2026: SeedTheme[] = [
  {
    title: "Анонс: встречаемся на Потолок Фест 18-19 июня",
    feature: "GENERAL",
    format: "REELS",
    audience: "BOTH",
    priority: 95,
    series: "fest-2026",
    seriesOrder: 1,
    scheduledFor: new Date("2026-05-28T00:00:00Z"),
    brief: {
      hook: "18-19 июня — Потолок Фест в Астане. Стенд 2×2, мы там с BLE-рулеткой и AI-конструктором.",
      problem: "Большинство мастеров в Казахстане работают по-старому. Смотрят на новое настороженно.",
      solution: "Приходите на стенд PotolokAI — потрогаем приложение руками, я покажу как BLE-рулетка экономит час на замере.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 4, description: "Я в кадре, на фоне баннер «Потолок Фест 2026»" },
        { order: 2, type: "object_closeup", durationSec: 4, description: "Логотип Потолок Фест с датой 18-19 июня" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Скриншот приложения с надписью «PotolokAI на стенде»" },
      ],
      voiceOver: "18-19 июня — Потолок Фест в Астане. Я буду на стенде PotolokAI с BLE-рулеткой и приложением. Приходите потрогать руками, я покажу как замер делается за пять минут вместо часа.",
      cta: "Сохраните дату — 18-19 июня",
      hashtagsHint: tags("#потолокфест", "#фест2026"),
      coverIndex: 0,
      durationSec: 18,
      techNotes: "Снять на улице или в офисе, хорошее освещение. Голос уверенный.",
    },
  },
  {
    title: "Что покажем на стенде — BLE-рулетка в деле",
    feature: "BLE_RULER",
    format: "REELS",
    audience: "BOTH",
    priority: 90,
    series: "fest-2026",
    seriesOrder: 2,
    scheduledFor: new Date("2026-06-04T00:00:00Z"),
    brief: {
      hook: "На стенде покажу как делать замер не глядя на телефон. BLE-рулетка → одно нажатие → цифра в приложении.",
      problem: "Большинство BLE-рулеток на рынке — это «купи за 5000 тенге, разочаруйся через неделю».",
      solution: "Мы реверс-инжинирили протокол Xiaomi BHR5596GL. Работает стабильно, в приложении подключается через QR.",
      shotList: [
        { order: 1, type: "object_closeup", durationSec: 3, description: "Рулетка крупно в руке" },
        { order: 2, type: "phone_camera", durationSec: 5, description: "Меряем стену — звук «бип», цифра появилась в numpad" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Numpad в Wall Wizard — цифры заполняются по тапу на рулетке" },
        { order: 4, type: "phone_camera", durationSec: 4, description: "Финал — комната замерена за 90 секунд" },
      ],
      voiceOver: "Покажу на стенде то что не покажу в Reels — как реально работает замер с BLE-рулеткой. Без режиссуры. Приходите, дам в руки.",
      cta: "Потолок Фест, стенд PotolokAI, 18-19 июня",
      hashtagsHint: tags("#blerulet", "#потолокфест"),
      coverIndex: 1,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Тизер keynote: «AI и потолки — где мы сейчас»",
    feature: "TECH_PASSPORT_AI",
    format: "CAROUSEL",
    audience: "BOTH",
    priority: 88,
    series: "fest-2026",
    seriesOrder: 3,
    scheduledFor: new Date("2026-06-11T00:00:00Z"),
    brief: {
      hook: "18 июня в 15:00 — мой keynote «AI и потолки». 15 минут о том, что уже работает.",
      problem: "Многие думают AI это магия. На самом деле это очень конкретные инструменты — распознавание плана БТИ, генерация КП, визуализация потолка.",
      solution: "Расскажу что уже работает в PotolokAI, что в разработке, и как мастер может это использовать прямо сейчас.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 4, description: "Я с тезисом «AI и потолки — где мы сейчас», 18 июня 15:00" },
        { order: 2, type: "object_closeup", durationSec: 3, description: "Скрин AI-распознавания плана БТИ — комнаты подсвечены" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "AI-визуализация: фото комнаты + потолок наложен" },
        { order: 4, type: "phone_camera", durationSec: 3, description: "Приглашение: «Stage 2, 15:00»" },
      ],
      voiceOver: "AI в нашей сфере — это не модное слово. Это распознавание плана БТИ за 10 секунд. Это автоматическая визуализация потолка по фото комнаты. Это снижение цикла продажи в три раза. Расскажу на keynote 18 июня.",
      cta: "Stage 2, 18 июня, 15:00 — приходите",
      hashtagsHint: tags("#aiвбизнесе", "#keynote"),
      coverIndex: 3,
      durationSec: 20,
      techNotes: "Снять у себя в офисе, спокойный фон.",
    },
  },
  {
    title: "Live со стенда — первый день феста",
    feature: "GENERAL",
    format: "REELS",
    audience: "BOTH",
    priority: 90,
    series: "fest-2026",
    seriesOrder: 4,
    scheduledFor: new Date("2026-06-18T00:00:00Z"),
    brief: {
      hook: "Мы на месте. Стенд готов. Народ идёт.",
      problem: "Кто не смог приехать — пусть увидит как это вживую.",
      solution: "5 секунд экспозиции + 5 секунд BLE-рулетки в деле + 5 секунд первого посетителя.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 4, description: "Общий план стенда, баннер PotolokAI" },
        { order: 2, type: "phone_camera", durationSec: 4, description: "Первые посетители щупают рулетку" },
        { order: 3, type: "phone_camera", durationSec: 4, description: "Я в кадре, машу — «приходите!»" },
      ],
      voiceOver: "Первый день Потолок Феста. Мы на стенде, BLE-рулетки разобраны, очередь стоит. Приезжайте сегодня или завтра — мы здесь до конца.",
      cta: "Сегодня и завтра, стенд PotolokAI",
      hashtagsHint: tags("#потолокфест", "#live"),
      coverIndex: 0,
      durationSec: 15,
      techNotes: "Снять вертикально на iPhone, не пытаться монтировать долго. Главное — энергия.",
    },
  },
  {
    title: "Итоги феста: спасибо всем кто пришёл",
    feature: "GENERAL",
    format: "CAROUSEL",
    audience: "BOTH",
    priority: 80,
    series: "fest-2026",
    seriesOrder: 5,
    scheduledFor: new Date("2026-06-20T00:00:00Z"),
    brief: {
      hook: "Два дня Потолок Феста. Спасибо за каждого кто подошёл к стенду — было о чём поговорить.",
      problem: "Без обратной связи от мастеров мы делаем приложение в вакууме.",
      solution: "На фесте получили десятки идей, увидели как реально работают мастера. Следующие апдейты будут острее.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 4, description: "Лица посетителей у стенда (с разрешения)" },
        { order: 2, type: "phone_camera", durationSec: 4, description: "Раздача листовок, разговоры" },
        { order: 3, type: "phone_camera", durationSec: 4, description: "Финал — я и команда у стенда" },
      ],
      voiceOver: "Спасибо всем кто пришёл на Потолок Фест и потратил минуту-другую на наш стенд. Услышал десятки полезных идей. Лучшие — в ближайших апдейтах PotolokAI. Спасибо.",
      cta: "PotolokAI — постоянно в App Store",
      hashtagsHint: tags("#потолокфест", "#спасибо"),
      coverIndex: 2,
      durationSec: 18,
      techNotes: "Тёплый монтаж, музыка спокойная.",
    },
  },
];

// ─────────────────────────────────────────────────────
// WOW (12 killer features, full briefs, no series)
// ─────────────────────────────────────────────────────

const wow: SeedTheme[] = [
  {
    title: "BLE-рулетка: замер одним тапом",
    feature: "BLE_RULER",
    format: "REELS",
    audience: "MASTERS",
    priority: 90,
    brief: {
      hook: "Не смотришь на телефон. Меряешь. Тап по рулетке — цифра в приложении.",
      problem: "Меряя стену — смотришь на рулетку. Записывать = либо запоминать, либо отрывать взгляд.",
      solution: "BLE-рулетка → bluetooth → один тап = цифра в numpad. Делаешь всю комнату не отрываясь.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 3, description: "Рулетка прижата к стене, телефон в кармане" },
        { order: 2, type: "phone_camera", durationSec: 4, description: "Тап на кнопку рулетки — слышен сигнал" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Numpad в приложении: цифра 3.42 появилась автоматически" },
        { order: 4, type: "phone_camera", durationSec: 4, description: "Финал — целая комната за 90 секунд" },
      ],
      voiceOver: "Все блютус-рулетки работают плохо. Кроме одной — Xiaomi BHR5596GL. И только если ты подключил её правильно. В PotolokAI это один QR-код.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#blerulet", "#автоматизация"),
      coverIndex: 3,
      durationSec: 18,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Гонка: BLE vs классическая рулетка",
    feature: "BLE_RULER",
    format: "REELS",
    audience: "MASTERS",
    priority: 85,
    brief: {
      hook: "Кто быстрее замерит комнату — BLE или классика? Гонка на время.",
      problem: "Спорить про «новое vs старое» бесполезно. Лучше показать секундомер.",
      solution: "Замеряю одну комнату дважды. Сначала классикой, потом BLE. Результат на экране.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 4, description: "Классическая рулетка, секундомер запущен" },
        { order: 2, type: "phone_camera", durationSec: 5, description: "Замеры + запись в блокнот: 2:30" },
        { order: 3, type: "phone_camera", durationSec: 4, description: "BLE-рулетка, секундомер запущен снова" },
        { order: 4, type: "phone_camera", durationSec: 4, description: "Замеры + цифры в приложении: 0:55", overlayText: "BLE — почти в 3 раза быстрее" },
      ],
      voiceOver: "Классика: две с половиной минуты на одну комнату. BLE через PotolokAI: меньше минуты. В три раза быстрее. За день экономишь час.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#blerulet", "#сравнение"),
      coverIndex: 3,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "AI-ассистент: сфоткал план — получил цену",
    feature: "TECH_PASSPORT_AI",
    format: "REELS",
    audience: "CLIENTS",
    priority: 90,
    brief: {
      hook: "Фоткаешь план БТИ из договора. Через 30 секунд — предварительная цена потолка. Без выезда мастера.",
      problem: "Узнать цену = вызвать замерщика. Замерщик едет час. Часто впустую.",
      solution: "AI читает план: видит комнаты, измеряет площади, считает примерную стоимость. Точность ±10%.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 3, description: "Берём в руки бумажный план квартиры" },
        { order: 2, type: "phone_camera", durationSec: 4, description: "Открываем приложение, тапаем «AI-ассистент», фоткаем план" },
        { order: 3, type: "screen_recording", durationSec: 5, description: "AI распознаёт комнаты, подсвечивает кухню/спальню" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Появилась предварительная цена 380 000 ₸" },
      ],
      voiceOver: "Не надо ждать замерщика чтобы понять бюджет. Сфоткал план из договора — через тридцать секунд предварительная цена. Понравилось — вызывай замерщика. Дорого — ищи дальше. Время никто не тратит.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#aiпотолки", "#ценапотолок"),
      coverIndex: 3,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Парящий потолок в 3 тапа",
    feature: "CONSTRUCTOR_3D",
    format: "REELS",
    audience: "BOTH",
    priority: 85,
    brief: {
      hook: "Парящий потолок с подсветкой — звучит дорого. В приложении делается тремя тапами.",
      problem: "Объяснить клиенту что такое «парящий с теневой LED-подсветкой» голосом — нереально.",
      solution: "Тап «Парящий» → подсветка по периметру в реалтайме. Клиент видит как будет, а не догадывается.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Замеренная комната в конструкторе" },
        { order: 2, type: "screen_recording", durationSec: 4, description: "Тап «По периметру» → «Парящий»" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "LED-подсветка появилась — крутим 3D" },
        { order: 4, type: "screen_recording", durationSec: 3, description: "Финал — парящий с тёплым светом" },
      ],
      voiceOver: "Тап. Тап. Тап. Парящий потолок с подсветкой. Клиент видит на экране, а не пытается представить. Продажа становится проще на порядок.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#парящийпотолок", "#3d"),
      coverIndex: 3,
      durationSec: 18,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Designer variant picker — 6 стилей потолка",
    feature: "CONSTRUCTOR_3D",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 80,
    brief: {
      hook: "Один потолок — 6 стилей оформления. Тапаешь профиль — видишь как будет.",
      problem: "Клиент не знает разницы между теневым, прямым и парящим профилем пока не увидит на своём потолке.",
      solution: "Designer picker: тап на категорию → bottom-sheet с фото вариантов → выбор моментально применяется в 3D.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Конструктор → тап «Профиль» → открылся picker" },
        { order: 2, type: "screen_recording", durationSec: 4, description: "Пластик / алюминий / теневой / парящий — карточки с фото" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Тап «Теневой» → 3D обновился" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Тап «Парящий» → 3D снова обновился" },
      ],
      voiceOver: "Клиент сидит рядом и листает варианты профилей. Видит свою комнату с пластиком. С алюминием. С теневым. С парящим. Выбирает — и сразу видит цену.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#профиль", "#designer"),
      coverIndex: 3,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Расчёт КП за 3 минуты",
    feature: "KP",
    format: "REELS",
    audience: "MASTERS",
    priority: 85,
    brief: {
      hook: "От «здравствуйте» до КП клиенту в WhatsApp — 3 минуты. Засекаю.",
      problem: "Считать КП в Excel = час времени. Половина мастеров делает «прикинул на глаз» — клиент потом разочаровывается.",
      solution: "Замер → конструктор → КП. Цены подтягиваются из твоего прайса. Тап «Поделиться» — ссылка готова.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 5, description: "Wall Wizard — комната готова" },
        { order: 2, type: "screen_recording", durationSec: 4, description: "Конструктор — софиты, парящий, светлинии" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "КП — таблица, итог 320 000 ₸" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Тап «Поделиться» → копируется ссылка для клиента" },
      ],
      voiceOver: "Замер. Конструктор. КП. Три минуты — клиент уже видит цифру в WhatsApp. Не «перезвоню через час с расчётом» — а прямо сейчас.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#кп", "#скорость"),
      coverIndex: 3,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Фото вариантов прямо в КП клиенту",
    feature: "KP",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 80,
    brief: {
      hook: "В КП — не только цены. К каждой строке фото — пластик, алюминий, теневой. Видишь за что платишь.",
      problem: "Обычное КП — это таблица с непонятными словами. «Гарпунный профиль», «теневой алюминий» — клиент не понимает.",
      solution: "У каждой строки КП — фото варианта. Клиент видит ровно тот пластик за который платит.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Публичная страница КП на телефоне клиента" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Тапаем строку «Профиль теневой» → раскрывается фото" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Тапаем «Полотно матовое» → фото и описание" },
        { order: 4, type: "screen_recording", durationSec: 3, description: "Итог — клиент понимает за что платит" },
      ],
      voiceOver: "Клиент платит не за слова в таблице. Он платит за конкретный пластик, который видит фото. КП с фото — это в три раза больше конверсии чем обычное.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#кп", "#визуализация"),
      coverIndex: 2,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Wall Wizard: рисуем комнату как в Sims",
    feature: "MEASUREMENT",
    format: "REELS",
    audience: "MASTERS",
    priority: 75,
    brief: {
      hook: "Замер не вводят цифрами в Excel. Его рисуют пальцем по экрану. Как в Sims.",
      problem: "Excel-замеры — это таблицы без визуала. Косяки видны только когда уже привёз профиля не той длины.",
      solution: "Wall Wizard: рисуешь стены пальцем, вводишь длины, видишь как комната замыкается в реальном времени.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Чистый Wall Wizard, тап на «+»" },
        { order: 2, type: "screen_recording", durationSec: 6, description: "Рисуем 4 стены пальцем — комната появляется" },
        { order: 3, type: "screen_recording", durationSec: 5, description: "Numpad — вводим длины, комната замыкается" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "3D-превью — всё ровно" },
      ],
      voiceOver: "Раньше замер выглядел как табличка в Excel. Теперь как комната в Sims. Рисуешь пальцем, видишь форму, видишь ошибки. Косяк понятен сразу — а не на стройке.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#замер", "#wallwizard"),
      coverIndex: 1,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Скруглённые углы и дуги — для эркеров",
    feature: "MEASUREMENT",
    format: "REELS",
    audience: "MASTERS",
    priority: 75,
    brief: {
      hook: "Эркер — это боль. Радиусы, расчёт длины дуги, ошибка на 10 см. В PotolokAI — три точки и готово.",
      problem: "Эркер замерить руками = считать радиус, длину дуги по формуле, потом ошибиться на 10 см потому что профиль не гибкий.",
      solution: "В Wall Wizard: тапаешь «Дуга», ставишь три точки на эркере — приложение считает радиус и длину профиля. Никаких формул.",
      shotList: [
        { order: 1, type: "phone_camera", durationSec: 3, description: "Эркер в комнате крупно" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "В Wall Wizard тапаем «Дуга», ставим три точки" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Дуга появилась, длина и радиус посчитаны" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "3D-превью с правильным эркером" },
      ],
      voiceOver: "Эркер — три точки. Приложение считает радиус, длину дуги, заказ профиля. Без формул, без ошибок на 10 сантиметров, без переделок.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#эркер", "#замер"),
      coverIndex: 3,
      durationSec: 20,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "До/После: 5 трансформаций потолков",
    feature: "PORTFOLIO",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 80,
    brief: {
      hook: "Бетонный потолок с трубами и проводами → натяжной с подсветкой. 5 примеров.",
      problem: "Клиенты не верят что из «вот этого» можно сделать «вот то». Особенно в старых хрущёвках.",
      solution: "Фото до/после с одного ракурса. Без обработки. Реальные комнаты реальных клиентов.",
      shotList: [
        { order: 1, type: "before_after", durationSec: 4, description: "Хрущёвка — до и после" },
        { order: 2, type: "before_after", durationSec: 4, description: "Новостройка с бетонным потолком — до и после" },
        { order: 3, type: "before_after", durationSec: 4, description: "Кухня — до и после с парящим" },
        { order: 4, type: "before_after", durationSec: 4, description: "Спальня — до и после с люстрой" },
        { order: 5, type: "before_after", durationSec: 4, description: "Зал — до и после со световыми линиями" },
      ],
      voiceOver: "Пять реальных комнат. До — с трубами и грязью. После — с подсветкой и порядком. Без фотошопа. Это то что мастер делает в каждой квартире.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#доипосле", "#портфолио"),
      coverIndex: 0,
      durationSec: 25,
      techNotes: "Если есть свои фото до/после — использовать их. Если нет — спросить у мастеров-партнёров.",
    },
  },
  {
    title: "Воронка CRM: где теряются клиенты",
    feature: "CRM",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 75,
    brief: {
      hook: "Из 10 лидов до договора доходят 3. Где теряются остальные 7? Воронка показывает.",
      problem: "Без CRM мастер не видит где обвал в продажах. «Кажется заказов меньше стало» — кажется.",
      solution: "Mini-CRM показывает воронку: Лид → Замер → КП → Договор. Видно где половина отваливается.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Таб «Клиенты» → вид «Воронка»" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Колонки: Новый (20) / Замер (12) / КП (7) / Договор (3)" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Тап «КП → Договор» — фильтр по «отказались»" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "Список из 4 клиентов — все «дорого». Значит цены надо смотреть" },
      ],
      voiceOver: "Лидов десять. Договоров три. Где потерялись семь? Воронка показывает: четверо отвалились на КП. Все сказали «дорого». Значит либо цены не туда, либо КП плохо показывает ценность. Без воронки этого не увидишь.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#crm", "#воронка"),
      coverIndex: 1,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
  {
    title: "Электронная подпись договора на телефоне клиента",
    feature: "CONTRACT",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 70,
    brief: {
      hook: "Договор подписан с телефона, сидя в кафе. Без печати, без принтера, без ЭЦП.",
      problem: "Чтобы подписать договор — встретиться, распечатать, подписать ручкой, отсканировать, отправить. Полчаса минимум.",
      solution: "Открываешь ссылку договора → читаешь → ФИО + галочка → подписано. ФИО + IP + timestamp = по закону РК легальная подпись.",
      shotList: [
        { order: 1, type: "screen_recording", durationSec: 4, description: "Открывается ссылка potolok.ai/contract/... на телефоне" },
        { order: 2, type: "screen_recording", durationSec: 5, description: "Скроллим договор — читаем условия" },
        { order: 3, type: "screen_recording", durationSec: 4, description: "Ввод ФИО + галочка «согласен»" },
        { order: 4, type: "screen_recording", durationSec: 4, description: "«Подписано ✓» с датой, IP" },
      ],
      voiceOver: "По новому закону Казахстана о электронных документах достаточно ФИО, галочки и фиксации IP. Без ЭЦП. Без бумаги. Подписал в три тапа — мастер получил уведомление — поехал устанавливать.",
      cta: "Скачай PotolokAI — ссылка в био",
      hashtagsHint: tags("#договор", "#эподпись"),
      coverIndex: 3,
      durationSec: 22,
      techNotes: TECH_NOTE,
    },
  },
];

// ─────────────────────────────────────────────────────
// SKELETONS (23 themes — minimal hook + 1-2 shots, LLM enriches on cp_shoot_*)
// ─────────────────────────────────────────────────────

function skeleton(shots: string[], hook: string): ContentBrief {
  return {
    hook,
    problem: "",
    solution: "",
    shotList: shots.map((description, idx) => ({
      order: idx + 1,
      type: "screen_recording" as const,
      description,
    })),
    cta: "Скачай PotolokAI — ссылка в био",
    hashtagsHint: [...COMMON_TAGS.slice(0, 2), ...KZ_TAGS.slice(0, 2)],
    techNotes: TECH_NOTE,
  };
}

const skeletons: SeedTheme[] = [
  {
    title: "Регистрация за 60 сек → первый замер",
    feature: "ONBOARDING",
    format: "REELS",
    audience: "MASTERS",
    priority: 65,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Регистрация по номеру", "Первый замер пустой комнаты"],
      "От установки приложения до первого замера — 60 секунд."
    ),
  },
  {
    title: "Welcome-тур приложения",
    feature: "ONBOARDING",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 50,
    isBriefSkeleton: true,
    brief: skeleton(
      ["5 главных экранов приложения с подписями"],
      "5 экранов которые открывают весь функционал PotolokAI."
    ),
  },
  {
    title: "Распознавание комнат с плана БТИ",
    feature: "TECH_PASSPORT_AI",
    format: "REELS",
    audience: "CLIENTS",
    priority: 75,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Фоткаем план БТИ", "AI выделяет кухню/спальню/зал автоматически"],
      "AI находит на плане комнаты сам. Без подсказок."
    ),
  },
  {
    title: "Предварительная цена без выезда замерщика",
    feature: "TECH_PASSPORT_AI",
    format: "CAROUSEL",
    audience: "BOTH",
    priority: 70,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Загружаем план", "AI считает площади", "Получаем диапазон цен ±10%"],
      "Понять бюджет — без вызова замерщика, за минуту."
    ),
  },
  {
    title: "Numpad: цифры без клавиатуры",
    feature: "MEASUREMENT",
    format: "REELS",
    audience: "MASTERS",
    priority: 50,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Полноэкранный numpad", "Вводим длины стен"],
      "Почему мы сделали свой numpad а не используем iOS-клавиатуру."
    ),
  },
  {
    title: "Произвольные углы — 135°, 47°",
    feature: "MEASUREMENT",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 55,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Не прямоугольная комната — строим с углом 135°"],
      "Комната не всегда прямоугольник. Wall Wizard это умеет."
    ),
  },
  {
    title: "Замер вокруг колонн",
    feature: "MEASUREMENT",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 45,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Комната с колонной — обходим её в Wall Wizard"],
      "Колонна в комнате? Замерится как родная."
    ),
  },
  {
    title: "Распаковка и QR-онбординг BLE-рулетки",
    feature: "BLE_RULER",
    format: "REELS",
    audience: "MASTERS",
    priority: 80,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Распаковка коробки Xiaomi", "Сканируем QR в приложении"],
      "Распаковка рулетки. Через минуту она в приложении."
    ),
  },
  {
    title: "Достать токен из Mi Home — пошагово",
    feature: "BLE_RULER",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 65,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Если QR не работает — как достать токен вручную через Mi Home"],
      "Запасной путь если QR-онбординг не сработал."
    ),
  },
  {
    title: "Софиты: где ставить чтобы было светло",
    feature: "CONSTRUCTOR_3D",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 65,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Расставляем софиты на 18 м² кухни", "Видим зоны освещённости в 3D"],
      "Сколько софитов нужно на твою комнату. Правило хорошего света."
    ),
  },
  {
    title: "Треки: 3 режима (поток/спот/линия)",
    feature: "CONSTRUCTOR_3D",
    format: "REELS",
    audience: "CLIENTS",
    priority: 60,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Добавляем трек", "Переключаем режимы — поток, спот, линия"],
      "Один трек — три разных световых сценария."
    ),
  },
  {
    title: "Световые линии — геометрия света",
    feature: "CONSTRUCTOR_3D",
    format: "REELS",
    audience: "CLIENTS",
    priority: 65,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Рисуем светлинии — параллельные / Г-образные / прямоугольник"],
      "Световые линии на потолке — модно. Покажу как это выглядит."
    ),
  },
  {
    title: "Экспорт PDF + публичная ссылка КП",
    feature: "KP",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 60,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Тап «Экспорт PDF»", "Клиент получает ссылку, открывает в браузере"],
      "КП в двух форматах сразу — PDF файлом и публичной страницей."
    ),
  },
  {
    title: "Редактирование КП при клиенте",
    feature: "KP",
    format: "REELS",
    audience: "MASTERS",
    priority: 55,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Клиент просит скидку 10%", "Меняешь сумму прямо в приложении при нём"],
      "Клиент просит скидку — меняешь цифры при нём, итог пересчитывается."
    ),
  },
  {
    title: "История всех КП клиента",
    feature: "KP",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 45,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Открываем клиента", "Список КП за всё время"],
      "Клиент вернётся через год — все его КП на месте."
    ),
  },
  {
    title: "Договор из КП в один тап",
    feature: "CONTRACT",
    format: "REELS",
    audience: "MASTERS",
    priority: 70,
    isBriefSkeleton: true,
    brief: skeleton(
      ["В сохранённом КП тап «Создать договор»", "Договор готов"],
      "Из КП в договор — одним тапом. Без переписывания."
    ),
  },
  {
    title: "Быстрые события: звонок/приехал/отказ",
    feature: "CRM",
    format: "REELS",
    audience: "MASTERS",
    priority: 60,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Карточка клиента", "Тап «WhatsApp» / «Звонок» / «Встреча» — события появляются в timeline"],
      "Быстрые события клиента — в один тап. Не забудешь о чём договорился."
    ),
  },
  {
    title: "Статусы сделок: воронка как у больших",
    feature: "CRM",
    format: "CAROUSEL",
    audience: "MASTERS",
    priority: 55,
    isBriefSkeleton: true,
    brief: skeleton(
      ["4 статуса: Новый / В работе / Договор / Завершено"],
      "Воронка из четырёх статусов. Простая и понятная."
    ),
  },
  {
    title: "2ГИС-интеграция: адрес одним кликом",
    feature: "CRM",
    format: "REELS",
    audience: "MASTERS",
    priority: 50,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Заводим клиента", "Автокомплит адреса из 2ГИС"],
      "Адрес клиента не вбиваешь руками — выбираешь из 2ГИС."
    ),
  },
  {
    title: "Прайс с фото вариантов",
    feature: "PRICE_LIST",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 60,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Прайс — каждая позиция с фото"],
      "Видишь не только цену, но и как выглядит."
    ),
  },
  {
    title: "Скрытие позиций для разных клиентов",
    feature: "PRICE_LIST",
    format: "REELS",
    audience: "MASTERS",
    priority: 45,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Скрываешь эконом-позиции", "Премиум-клиент видит только премиум"],
      "Премиум-клиенту не показываешь эконом — управление видимостью."
    ),
  },
  {
    title: "Категории портфолио — кухня/спальня/гостиная",
    feature: "PORTFOLIO",
    format: "CAROUSEL",
    audience: "CLIENTS",
    priority: 55,
    isBriefSkeleton: true,
    brief: skeleton(
      ["Портфолио по категориям", "Клиент выбирает свой тип комнаты — видит подходящие работы"],
      "Портфолио сортированное — клиент видит свою комнату в работе."
    ),
  },
  {
    title: "Как мастер ведёт портфолио в приложении",
    feature: "PORTFOLIO",
    format: "REELS",
    audience: "MASTERS",
    priority: 45,
    isBriefSkeleton: true,
    brief: skeleton(
      ["После замера снимаешь фото", "Загружаешь в портфолио к клиенту"],
      "Снял на замере — загрузил. Портфолио растёт само."
    ),
  },
];

// ─────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────

async function main() {
  const all = [...masterClass, ...fest2026, ...wow, ...skeletons];
  console.log(`[seed-content-plan] Seeding ${all.length} themes…`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const theme of all) {
    // Idempotency: try to find by series+seriesOrder first, fallback to title
    const existing = theme.series && theme.seriesOrder
      ? await prisma.contentPlan.findFirst({
          where: { series: theme.series, seriesOrder: theme.seriesOrder },
        })
      : await prisma.contentPlan.findFirst({ where: { title: theme.title } });

    if (existing && existing.status !== "IDEA") {
      // Already touched (SCHEDULED/PUBLISHED/SKIPPED) — don't override user state
      skipped++;
      continue;
    }

    const data = {
      title: theme.title,
      feature: theme.feature,
      format: theme.format,
      audience: theme.audience,
      priority: theme.priority,
      brief: JSON.parse(JSON.stringify(theme.brief)),
      isBriefSkeleton: theme.isBriefSkeleton ?? false,
      series: theme.series ?? null,
      seriesOrder: theme.seriesOrder ?? null,
      scheduledFor: theme.scheduledFor ?? null,
      releaseTag: theme.releaseTag ?? null,
    };

    if (existing) {
      await prisma.contentPlan.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.contentPlan.create({ data });
      created++;
    }
  }

  console.log(`[seed-content-plan] Done. created=${created} updated=${updated} skipped=${skipped} total_in_db_now=${await prisma.contentPlan.count()}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
