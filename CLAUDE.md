# potolok.ai

B2B SaaS для мастеров натяжных потолков в Казахстане.

## Stack
- Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui
- Prisma 7 + Neon PostgreSQL (PrismaNeonHttp — HTTP адаптер)
- AI: OpenRouter (openai SDK), model `anthropic/claude-sonnet-4.5` (claude-sonnet-4 снята с OpenRouter 15.10.2026)
- PDF: @react-pdf/renderer + pdfkit
- Storage: Vercel Blob
- Telegram bot: webhook + multi-agent vision
- Mobile: Capacitor 8 (iOS/Android wrapper)

## Commands
```bash
npm run dev        # Dev server
npm run build      # prisma generate + next build
npx prisma generate  # After schema changes
npx prisma db push   # Push schema to Neon
```

## Architecture
- `src/app/` — Next.js App Router (marketing, public KP, dashboard, API routes)
- `src/components/` — UI (assistant, calculator, layout, onboarding, shadcn/ui)
- `src/lib/` — Business logic (calculate.ts, room-geometry.ts, openrouter.ts, telegram-bot.ts)
- `src/generated/prisma/` — Generated Prisma client (**committed to repo**)
- `prisma/schema.prisma` — DB schema
- Path alias: `@/*` → `./src/*`

## Key Rules
- **react-pdf**: НЕ использовать `gap`, `fontStyle:"italic"`, `borderRadius`, `paddingVertical` — крашит!
- **Prisma client**: generated в `src/generated/prisma` (закоммичен)
- **prisma.config.ts**: загружает `.env.local`
- **pdfkit**: в `next.config.ts` как serverExternalPackages
- **AI model**: менять только в `src/lib/openrouter.ts`
- **Env vars**: DATABASE_URL, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, BLOB_READ_WRITE_TOKEN, CRON_SECRET, TIPTOP_PUBLIC_ID/TIPTOP_API_SECRET (оплата картой), PAYMENTS_OPEN, BILLING_ENABLED, ADMIN_TG_CHAT_ID, KASPI_PHONE/KASPI_RECEIVER_NAME, GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (OAuth-клиент «potolok-bot», проект Potolok AI), GOOGLE_TOKEN_KEY (32 байта base64 — AES-GCM для refresh_token календаря)

## Features
- Расчёт потолка по фото (AI vision)
- КП (коммерческое предложение) с публичной ссылкой
- Визуальный конструктор потолка
- Серверные замеры с фото комнат
- Каталог мастеров
- Telegram-бот — уведомления (привязка по телефону/коду, сброс пароля, «клиент открыл КП / подписал договор / акт», напоминания, кнопки ✅/❌ оплат для владельца) + **Google Календарь голосом** (17.10.2026): кнопка «Подключить Google Календарь» → `/api/google/start` → OAuth → `/api/google/callback` → `GoogleCalendarLink` (ключ — telegramChatId, работает и без аккаунта potolok.ai). Любой текст/голос в чате с календарём → `src/lib/calendar-assistant.ts`: голос расшифровывает `google/gemini-2.5-flash` (ogg напрямую), событие вынимает AI_MODEL, черновик в `CalendarDraft`, карточка [Сохранить][Изменить][Отмена] → events.insert с напоминанием за час и за день. OAuth-экран Google в режиме Testing (тест-юзеры), публикация после проверки Google. `src/lib/google-calendar.ts` — токены (AES-GCM), state (HMAC), refresh, invalid_grant → связь удаляется. Instagram-постинг из бота удалён 14.10.2026 (никто не пользовался с апреля). Модели InstagramAccount/InstagramPost/InstagramSession/ContentPlan в схеме остались пустыми — можно дропать.
- Пуши мастеру: `src/lib/push.ts` (Expo Push; устройства в PushDevice). Кроны (vercel.json, UTC): `kp-unsent` 04:00 «посчитал, но не отправил КП» (вчерашние DRAFT), `tg-followups` 04:00 «кому позвонить» (пуш всем + Telegram), `tg-reminders` каждые 5 мин «за час до события» (пуш + Telegram), `act-reminders`, `billing-reminders` 05:00, `backup-data` 23:00, `onboarding-pushes` каждый час — цепочка новичку «не замерил» h2/d1/d3 (таблица OnboardingPush, тихие часы 21–09 Алматы, `?dry=1` без отправки, отчёт `scratchpad/onboarding-push-report.mjs`). Пуш открывает экран по `data.screen` (например `/estimate/{id}`, пробный замер `/(tabs)/measurements?start=1&practice=1`).
- Оплата: `src/lib/billing.ts` (цены/даты/лимит), `src/lib/payment.ts` (Kaspi вручную, активация), `src/lib/tiptop.ts` + `/api/payment/tiptop/*` (карта через TipTop Pay)
