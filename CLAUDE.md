# potolok.ai

B2B SaaS для мастеров натяжных потолков в Казахстане.

## Stack
- Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui
- Prisma 7 + Neon PostgreSQL (PrismaNeonHttp — HTTP адаптер)
- AI: OpenRouter (openai SDK), model `anthropic/claude-sonnet-4`
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
- **Env vars**: DATABASE_URL, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, BLOB_READ_WRITE_TOKEN, INSTAGRAM_* (4 vars), CRON_SECRET

## Features
- Расчёт потолка по фото (AI vision)
- КП (коммерческое предложение) с публичной ссылкой
- Визуальный конструктор потолка
- Серверные замеры с фото комнат
- Каталог мастеров
- Telegram-бот с 3 параллельными агентами
- **Instagram автопостинг** — /post в Telegram → 5 AI-агентов → превью → публикация

## Instagram Auto-Posting
- `src/lib/instagram.ts` — Instagram Graph API client
- `src/lib/instagram-agents.ts` — 5 AI agents pipeline (Analyzer, Strategist, Copywriter, Visual Editor, Scheduler)
- `src/lib/instagram-publisher.ts` — Orchestrator (pipeline → preview → publish)
- `src/app/api/cron/instagram-publish/route.ts` — Cron for scheduled posts
- Telegram: `/post` command → collect photos → run pipeline → inline buttons
- Instagram User ID: stored in DB (InstagramAccount model)
- Token expires in 60 days — needs refresh
