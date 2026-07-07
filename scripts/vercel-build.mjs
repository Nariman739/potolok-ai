#!/usr/bin/env node
// Vercel build entry point — v2 with Neon cold-start handling.
//
// Steps:
//   1. prisma generate            — always.
//   2. Production only:
//        a) Extend DATABASE_URL connect/pool timeouts to 30s.
//        b) Wake-up ping (SELECT 1) to unsuspend Neon compute.
//        c) prisma migrate deploy with up to 3 retries (5s backoff).
//   3. next build                 — always.
//
// Why v2: PR #2 (dacb1fa) failed in prod with P1001 "Can't reach database
// server". Neon Launch plan autosuspends compute after 5 min idle; the
// default Prisma connect timeout (~5s) wasn't enough to wake it during
// the Vercel build window. v2 extends the timeout AND warms the DB before
// migrate deploy, AND retries — covering all three failure modes.
//
// Local sanity checks:
//   npm run build                                  # skip migrations
//   VERCEL_ENV=preview npm run build               # skip migrations
//   VERCEL_ENV=production DATABASE_URL=<bogus> \   # wake-up + 3 retries → exit 1
//     npm run build

import { execSync, spawnSync } from "node:child_process";

console.log("[vercel-build] VERCEL_ENV=" + (process.env.VERCEL_ENV || "(unset)"));

function run(cmd) {
  console.log(`[vercel-build] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    const code = typeof err.status === "number" ? err.status : 1;
    console.error(`[vercel-build] step failed: ${cmd} (exit ${code})`);
    process.exit(code);
  }
}

function tryRun(cmd) {
  console.log(`[vercel-build] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

function extendDatabaseTimeouts() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.warn("[vercel-build] DATABASE_URL is not set — skipping timeout patch");
    return;
  }
  try {
    const url = new URL(raw);
    url.searchParams.set("connect_timeout", "30");
    url.searchParams.set("pool_timeout", "30");
    process.env.DATABASE_URL = url.toString();
    console.log("[vercel-build] Extended timeouts to 30s for migration");
  } catch (err) {
    console.warn(
      `[vercel-build] Could not parse DATABASE_URL to patch timeouts: ${err.message}`,
    );
  }
}

// Neon pooled endpoint (PgBouncer, transaction mode) НЕ держит session-level
// advisory locks, которые Prisma migrate берёт на старте → P1002 «timed out
// acquiring advisory lock», деплой падает (инцидент 07.07.2026). Миграции
// должны идти через ПРЯМОЕ (non-pooled) соединение: у Neon это тот же host
// без суффикса `-pooler`. Рантайму оставляем pooled (лучше держит нагрузку).
function toDirectUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace("-pooler.", ".");
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return url;
  }
}

function wakeUpNeon() {
  // ВАЖНО: без --schema! В Prisma 7 с prisma.config.ts флаг --schema
  // конфликтует с datasource из конфига и команда падает (status=1) —
  // Neon не будился, migrate deploy таймаутил на advisory lock (P1002)
  // пока холодная база просыпалась. Инцидент 07.07.2026. Config.ts сам
  // даёт datasource, поэтому достаточно `prisma db execute --stdin`.
  console.log("[vercel-build] $ prisma db execute --stdin  # SELECT 1 wake-up");
  const result = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--stdin"],
    {
      input: "SELECT 1;\n",
      stdio: ["pipe", "inherit", "inherit"],
      timeout: 30_000,
      encoding: "utf8",
    },
  );
  if (result.status === 0) {
    console.log("[vercel-build] wake-up ping ok");
  } else {
    console.warn(
      "[vercel-build] wake-up ping failed, will retry migrate " +
        `(status=${result.status}, signal=${result.signal ?? "none"})`,
    );
  }
}

function migrateWithRetry(maxAttempts = 3, backoffMs = 5_000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[vercel-build] migrate deploy attempt ${attempt}/${maxAttempts}`);
    if (tryRun("prisma migrate deploy")) {
      return;
    }
    if (attempt < maxAttempts) {
      console.log(`[vercel-build] sleeping ${backoffMs}ms before retry`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoffMs);
      // Повторно будим Neon перед следующей попыткой — если база успела
      // снова заснуть между ретраями, advisory lock опять таймаутил бы.
      wakeUpNeon();
    }
  }
  console.error("[vercel-build] migrate deploy failed after all retries");
  process.exit(1);
}

run("prisma generate");

if (process.env.VERCEL_ENV === "production") {
  extendDatabaseTimeouts();
  // Миграции — через прямое (non-pooled) соединение, иначе advisory lock
  // таймаутит на pgbouncer. Рантайм/next build остаются на pooled URL.
  const pooledUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = toDirectUrl(pooledUrl);
  console.log("[vercel-build] migrate via direct (non-pooled) connection");
  wakeUpNeon();
  migrateWithRetry();
  process.env.DATABASE_URL = pooledUrl;
} else {
  console.log("[vercel-build] skipping prisma migrate deploy (not Production)");
}

run("next build");
