// allowedLogoSource (ревью 8d, 12.11.2026): npx tsx scratchpad/og-logo-check.ts
process.env.BLOB_PUBLIC_HOST = "abc123.public.blob.vercel-storage.com";
delete process.env.BLOB_READ_WRITE_TOKEN;
import { allowedLogoSource, ogLogoProxyUrl } from "@/lib/og-logo";
const H = "https://abc123.public.blob.vercel-storage.com";
const cases: Array<[string | null | undefined, string | null]> = [
  // прежнее поведение
  [`${H}/logos/m1-AbC.png`, `${H}/logos/m1-AbC.png`],
  [`${H.toUpperCase().replace("HTTPS", "https")}/logos/a.jpg`, `${H}/logos/a.jpg`],
  [`${H}:443/logos/a.png`, `${H}/logos/a.png`],
  [`http://abc123.public.blob.vercel-storage.com/logos/a.png`, null],
  [`${H}:8443/logos/a.png`, null],
  [`https://user:pw@abc123.public.blob.vercel-storage.com/logos/a.png`, null],
  [`https://user@abc123.public.blob.vercel-storage.com/logos/a.png`, null],
  [`https://other.public.blob.vercel-storage.com/logos/a.png`, null],
  [`https://abc123.public.blob.vercel-storage.com.evil.com/logos/a.png`, null],
  [`https://evil.com/abc123.public.blob.vercel-storage.com/logos/a.png`, null],
  [`https://evil.com/logos/a.png`, null],
  [`ftp://abc123.public.blob.vercel-storage.com/logos/a.png`, null],
  [`file:///etc/passwd`, null],
  [`javascript:alert(1)`, null],
  [`/logos/a.png`, null],
  [`not a url`, null],
  [``, null],
  [null, null],
  [`${H}/logos/${"a".repeat(2100)}.png`, null],
  // новое: query / hash
  [`${H}/logos/a.png?x=1`, null],
  [`${H}/logos/a.png?x=2`, null],
  [`${H}/logos/a.png#f`, null],
  [`${H}/logos/a.png?`, `${H}/logos/a.png`],
  [`${H}/logos/a.png#`, `${H}/logos/a.png`],
  // новое: только /logos/
  [`${H}/portfolio/a.jpg`, null],
  [`${H}/logos`, null],
  [`${H}/logos/`, null],
  [`${H}/logosx/a.png`, null],
  [`${H}/LOGOS/a.png`, null],
  [`${H}/logos/../x.png`, null],
  [`${H}/logos/%2e%2e/x.png`, null],
  [`${H}/logos/%2E%2E/x.png`, null],
  [`${H}/logos/.%2e/x.png`, null],
  [`${H}/logos%2F..%2Fx.png`, null],
  [`${H}/logos%2Fa.png`, null],
  [`${H}\\logos\\a.png`, `${H}/logos/a.png`],
  [`${H}/x/../logos/a.png`, `${H}/logos/a.png`],
  [`${H}/logos/./a.png`, `${H}/logos/a.png`],
  [`${H}/logos/sub/a.png`, `${H}/logos/sub/a.png`],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = allowedLogoSource(input)?.toString() ?? null;
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", JSON.stringify(input)?.slice(0, 70), "→", got);
}
const proxy = ogLogoProxyUrl(`${H}/logos/a.png?`);
console.log(proxy === `https://potolok.ai/api/og-logo?u=${encodeURIComponent(`${H}/logos/a.png`)}` ? "ok  " : (fail++, "FAIL"), "proxy без «?»", proxy);
console.log(`${cases.length + 1} случаев, провалов: ${fail}`);
process.exit(fail ? 1 : 0);
