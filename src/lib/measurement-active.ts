/**
 * «Активный» замер веба — свой у каждого человека, а не на всю компанию (10.11.2026).
 * activeById — кто держит объект открытым в вебе. У старых активных его нет:
 * они принадлежат автору (masterId). Приложение статус active не читает.
 */
export function activeMineWhere(personId: string) {
  return {
    status: "active",
    OR: [{ activeById: personId }, { activeById: null, masterId: personId }],
  };
}

export function isActiveMine(obj: { status: string; activeById: string | null; masterId: string }, personId: string): boolean {
  return obj.status === "active" && (obj.activeById === personId || (obj.activeById === null && obj.masterId === personId));
}

/** Поле activeById при смене статуса: открыл в вебе — я, любой другой статус — никто. */
export function activeByFor(status: string | undefined, personId: string): { activeById?: string | null } {
  if (status === undefined) return {};
  return { activeById: status === "active" ? personId : null };
}
