export function formatPrice(price: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(price)) + " ₸";
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
