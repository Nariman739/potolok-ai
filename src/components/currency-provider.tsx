"use client";

import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import { CURRENCIES, asCurrency, type CurrencyCode } from "@/lib/currency";
import { formatPrice, setClientCurrency } from "@/lib/format";

type Ctx = {
  code: CurrencyCode;
  /** «₸» или «₽». */
  symbol: string;
  /** «120 000 ₸». */
  format: (n: number) => string;
};

const CurrencyContext = createContext<Ctx>({
  code: "KZT",
  symbol: CURRENCIES.KZT.symbol,
  format: (n) => formatPrice(n, "KZT"),
});

/**
 * Валюта мастера для клиентских компонентов (07.10.2026). Оборачивает дашборд
 * и публичные страницы; значение приходит с сервера из getCurrentMaster /
 * владельца КП. Заодно выставляет глобал для formatPrice без аргумента.
 */
export function CurrencyProvider({ currency, children }: { currency: string | null | undefined; children: React.ReactNode }) {
  const code = asCurrency(currency);
  // До первого рендера детей, чтобы formatPrice() в них уже знал валюту.
  setClientCurrency(code);
  useLayoutEffect(() => setClientCurrency(code), [code]);
  const value = useMemo<Ctx>(
    () => ({ code, symbol: CURRENCIES[code].symbol, format: (n) => formatPrice(n, code) }),
    [code],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): Ctx {
  return useContext(CurrencyContext);
}
