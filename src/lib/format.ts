import { currencySymbol, type CurrencyCode } from "./currency";

/**
 * Валюта по умолчанию для клиентских компонентов. В браузере её один раз
 * выставляет CurrencyProvider (дашборд) или публичная страница КП, и все
 * formatPrice(x) без второго аргумента печатают правильный знак.
 * На сервере глобал НЕ трогаем (запросы разных мастеров идут параллельно):
 * серверный код передаёт валюту явно вторым аргументом.
 */
let clientCurrency: CurrencyCode = "KZT";
export function setClientCurrency(code: CurrencyCode): void {
  if (typeof window !== "undefined") clientCurrency = code;
}
export function getClientCurrency(): CurrencyCode {
  return clientCurrency;
}

export function formatPrice(price: number, currency: CurrencyCode | string = clientCurrency): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(price)) + " " + currencySymbol(currency);
}

export function formatArea(area: number): string {
  return area.toFixed(1) + " м²";
}

export function formatPerimeter(perimeter: number): string {
  return perimeter.toFixed(1) + " м.п.";
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
