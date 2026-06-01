#!/usr/bin/env node
// Vercel build entry point.
//
// Steps (in order):
//   1. prisma generate          — always (Next.js needs the typed client).
//   2. prisma migrate deploy    — Production only (VERCEL_ENV=production).
//                                  Skipped on Preview / local builds because
//                                  those use a different (or no) DATABASE_URL.
//   3. next build               — always.
//
// Failing fast on any step prevents the bug pattern from 2026-05-25, where a
// new schema.prisma column shipped to prod without the matching SQL and the
// login/register routes started 500'ing.
//
// To exercise this locally:
//   VERCEL_ENV=production npm run build   # tries migrate deploy → next build
//   VERCEL_ENV=preview    npm run build   # skips migrate deploy
//   npm run build                         # skips migrate deploy (unset)

import { execSync } from "node:child_process";

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

run("prisma generate");

if (process.env.VERCEL_ENV === "production") {
  run("prisma migrate deploy");
} else {
  console.log("[vercel-build] skipping prisma migrate deploy (not Production)");
}

run("next build");
