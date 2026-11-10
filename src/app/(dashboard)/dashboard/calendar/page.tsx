import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentMaster } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { getCalendarClients, getCalendarEntries } from "@/lib/crm-calendar-data";
import { almatyDay, monthGrid, parseMonth } from "@/lib/crm-calendar";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = {
  title: "Календарь",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const scope = await getScope(master);
  const params = await searchParams;
  const month = parseMonth(params.m);
  // ?d=YYYY-MM-DD — день, выбранный на телефоне (свайп недели через границу месяца); мусор — игнорируем
  const initialDay = params.d && /^20\d{2}-\d{2}-\d{2}$/.test(params.d) ? params.d : null;
  const [entries, clients] = await Promise.all([
    getCalendarEntries(scope, master.id, month),
    getCalendarClients(scope),
  ]);

  return (
    <div data-wide-page>
      <CalendarView
        month={month}
        days={monthGrid(month).days}
        today={almatyDay(new Date())}
        entries={entries}
        clients={clients}
        isTeam={scope.isTeam}
        initialDay={initialDay}
      />
    </div>
  );
}
