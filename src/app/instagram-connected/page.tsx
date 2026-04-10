import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Instagram подключение | Potolok.ai",
};

export default async function InstagramConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; username?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const status = params.status || "error";
  const username = params.username || "";
  const msg = params.msg || "";

  const isSuccess = status === "success";
  const isDenied = status === "denied";

  const errorMessages: Record<string, string> = {
    no_pages: "Не найдена страница Facebook. Создайте страницу и привяжите к ней Instagram.",
    no_instagram: "Не найден Instagram бизнес-аккаунт. Убедитесь что Instagram переведён в бизнес-аккаунт и привязан к странице Facebook.",
    token_exchange: "Ошибка авторизации. Попробуйте ещё раз.",
    expired: "Ссылка устарела. Запросите новую через бот командой /connect",
    missing_params: "Неверные параметры. Попробуйте ещё раз.",
    config: "Ошибка конфигурации. Обратитесь в поддержку.",
    internal: "Внутренняя ошибка. Попробуйте ещё раз через минуту.",
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {isSuccess ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Instagram подключён!
            </h1>
            {username && (
              <p className="text-lg text-gray-600 mb-4">
                Аккаунт: <b>@{username}</b>
              </p>
            )}
            <p className="text-gray-500 mb-8">
              Теперь откройте Telegram-бот и отправьте фото потолка — AI
              создаст пост для вашего Instagram.
            </p>
            <a
              href="https://t.me/potolok_ai_bot"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Открыть Telegram-бот
            </a>
          </>
        ) : isDenied ? (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Доступ не предоставлен
            </h1>
            <p className="text-gray-500 mb-8">
              Вы отклонили запрос на доступ к Instagram. Чтобы бот мог
              публиковать посты, нужно дать разрешение.
            </p>
            <p className="text-sm text-gray-400">
              Напишите /connect в Telegram-боте чтобы попробовать снова
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Не удалось подключить
            </h1>
            <p className="text-gray-500 mb-4">
              {errorMessages[msg] || "Произошла ошибка. Попробуйте ещё раз."}
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left text-sm text-gray-600 mb-6">
              <p className="font-medium mb-2">Проверьте:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Instagram переведён в бизнес-аккаунт</li>
                <li>Есть страница в Facebook</li>
                <li>Instagram привязан к странице Facebook</li>
              </ul>
            </div>
            <a
              href="/instagram-guide"
              className="text-blue-600 underline text-sm"
            >
              Подробная инструкция
            </a>
          </>
        )}
      </div>
    </div>
  );
}
