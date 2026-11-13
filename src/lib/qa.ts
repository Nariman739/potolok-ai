/**
 * QA-аккаунты (13.11.2026): общий список вместо локальных копий.
 * QA_PHONES — казахстанские QA и тестовые регистрации (раньше жил в cron/onboarding-pushes).
 * QA_RU_PHONES — российский QA.
 */
export const QA_PHONES = ["+77000000077", "+77000000078", "+77000000079", "+77000000099"];
export const QA_RU_PHONES = ["+79990000077"];
export const ALL_QA_PHONES = [...QA_PHONES, ...QA_RU_PHONES];
