// Phone number normalization for Kazakhstan (+7)
// Accepts: +7XXXXXXXXXX, 8XXXXXXXXXX, 7XXXXXXXXXX, with any spaces/dashes/parens

/**
 * Normalize phone to +7XXXXXXXXXX format.
 * Returns null if invalid.
 */
export function normalizePhone(raw: string): string | null {
  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, "");

  let digits: string;

  if (cleaned.startsWith("+7")) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith("87") || cleaned.startsWith("8")) {
    // Kazakhstan: 8 = +7
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith("7") && cleaned.length === 11) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  // Must be exactly 10 digits after country code
  if (digits.length !== 10) return null;

  // Must start with valid KZ prefix (7xx or 6xx)
  if (!/^[0-9]/.test(digits)) return null;

  return `+7${digits}`;
}

/**
 * Format phone for display: +7 (700) 123-45-67
 */
export function formatPhone(phone: string): string {
  const match = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!match) return phone;
  return `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`;
}

/**
 * Check if string looks like a phone number
 */
export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 12;
}
