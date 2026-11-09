"use client";

import { useSyncExternalStore } from "react";
import { useCurrency } from "@/components/currency-provider";
import { ALMATY_CLOCK, LOCAL_CLOCK, type Clock } from "@/lib/crm-calendar";

const subscribe = () => () => {};

/**
 * Часы мастера: в Казахстане всегда Астана, в России — пояс браузера. Сервер пояса
 * браузера не знает, поэтому первая отрисовка по Астане, а местное время после неё.
 */
export function useClock(): Clock {
  const { code } = useCurrency();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return code === "RUB" && mounted ? LOCAL_CLOCK : ALMATY_CLOCK;
}
