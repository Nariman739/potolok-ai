// Phone number normalization.
// Supports international formats for CIS countries (typical user base):
//   +7   — Kazakhstan, Russia
//   +992 — Tajikistan
//   +993 — Turkmenistan
//   +994 — Azerbaijan
//   +995 — Georgia
//   +996 — Kyrgyzstan
//   +998 — Uzbekistan
// Local KZ format «8XXXXXXXXXX» is converted to «+7XXXXXXXXXX».
// Any other +XXX prefix is accepted if total length is 10-15 digits (E.164).

type CountryPrefix = { code: string; digitsAfter: number };

const CIS_PREFIXES: CountryPrefix[] = [
  { code: "+7",   digitsAfter: 10 }, // KZ, RU
  { code: "+373", digitsAfter: 8  }, // Moldova
  { code: "+374", digitsAfter: 8  }, // Armenia
  { code: "+375", digitsAfter: 9  }, // Belarus
  { code: "+380", digitsAfter: 9  }, // Ukraine
  { code: "+992", digitsAfter: 9  }, // Tajikistan
  { code: "+993", digitsAfter: 8  }, // Turkmenistan
  { code: "+994", digitsAfter: 9  }, // Azerbaijan
  { code: "+995", digitsAfter: 9  }, // Georgia
  { code: "+996", digitsAfter: 9  }, // Kyrgyzstan
  { code: "+998", digitsAfter: 9  }, // Uzbekistan
];

/**
 * Normalize phone to E.164 format (e.g. +7XXXXXXXXXX, +992XXXXXXXXX).
 * Returns null if invalid.
 */
export function normalizePhone(raw: string): string | null {
  // Strip everything except digits and a single leading +
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");

  // Local Kazakhstan format: 8XXXXXXXXXX → +7XXXXXXXXXX
  if (/^8\d{10}$/.test(cleaned)) {
    return `+7${cleaned.slice(1)}`;
  }

  if (!cleaned.startsWith("+")) {
    return null;
  }

  // Try known CIS prefixes first (strictest validation per country)
  for (const { code, digitsAfter } of CIS_PREFIXES) {
    if (cleaned.startsWith(code)) {
      const rest = cleaned.slice(code.length);
      if (rest.length === digitsAfter && /^\d+$/.test(rest)) {
        return `${code}${rest}`;
      }
      return null;
    }
  }

  // Generic E.164 fallback for other countries (8-15 total digits after +)
  if (/^\+\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Format phone for display.
 * KZ/RU: +7 (700) 123-45-67
 * Other CIS: +992 99 123 45 67
 * Other: returns as-is
 */
export function formatPhone(phone: string): string {
  const kzMatch = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (kzMatch) return `+7 (${kzMatch[1]}) ${kzMatch[2]}-${kzMatch[3]}-${kzMatch[4]}`;

  // Generic CIS format: +XXX YY YYY YY YY
  const cisMatch = phone.match(/^(\+\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (cisMatch) return `${cisMatch[1]} ${cisMatch[2]} ${cisMatch[3]} ${cisMatch[4]} ${cisMatch[5]}`;

  return phone;
}

/**
 * Check if string looks like a phone number
 */
export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 12;
}
