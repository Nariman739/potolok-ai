import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Как подключить Instagram-бот | Potolok.ai",
  description:
    "Пошаговая инструкция по подключению SMM-бота для автопостинга в Instagram",
};

export default function InstagramGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Как подключить Instagram-бот
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          Пошаговая инструкция для мастеров
        </p>
        <p className="text-gray-600 mb-10 leading-relaxed">
          SMM-бот Potolok.ai создаёт посты для вашего Instagram прямо из
          Telegram. Вы отправляете фото работы — бот пишет описание, подбирает
          хэштеги и публикует в лучшее время. Ниже — как всё настроить.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-10">
          <p className="text-blue-900 font-medium mb-1">Что вам нужно:</p>
          <ul className="text-blue-800 text-sm space-y-1 list-disc pl-5">
            <li>Аккаунт на potolok.ai</li>
            <li>Telegram на телефоне</li>
            <li>
              Instagram <b>Бизнес-аккаунт</b> (не личный!)
            </li>
            <li>Страница в Facebook (привязанная к Instagram)</li>
          </ul>
        </div>

        {/* ─── Шаг 1 ─── */}
        <Step number={1} title="Переведите Instagram в бизнес-аккаунт">
          <p className="mb-3">
            Если у вас уже бизнес-аккаунт — переходите к шагу 2.
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              Откройте Instagram → <b>Настройки</b> (три полоски вверху справа)
            </li>
            <li>
              <b>Тип аккаунта и инструменты</b> →{" "}
              <b>Переключиться на профессиональный аккаунт</b>
            </li>
            <li>
              Выберите категорию: <b>Строительство</b> или{" "}
              <b>Ремонт и отделка</b>
            </li>
            <li>
              Выберите <b>Бизнес</b> (не &quot;Автор&quot;)
            </li>
            <li>Готово! Теперь у вас бизнес-аккаунт</li>
          </ol>
          <Tip>
            Бизнес-аккаунт бесплатный и даёт доступ к статистике постов.
          </Tip>
        </Step>

        {/* ─── Шаг 2 ─── */}
        <Step number={2} title="Создайте страницу в Facebook">
          <p className="mb-3">
            Instagram бизнес-аккаунт должен быть привязан к странице Facebook.
            Если у вас уже есть страница — переходите к шагу 3.
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              Откройте{" "}
              <a
                href="https://www.facebook.com/pages/create"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                facebook.com/pages/create
              </a>
            </li>
            <li>
              Название: например <b>Натяжные потолки Астана</b> (ваша компания)
            </li>
            <li>
              Категория: <b>Строительная компания</b> или <b>Ремонт</b>
            </li>
            <li>Нажмите &quot;Создать страницу&quot;</li>
          </ol>
        </Step>

        {/* ─── Шаг 3 ─── */}
        <Step number={3} title="Привяжите Instagram к Facebook странице">
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              В Instagram: <b>Настройки</b> → <b>Аккаунт</b> →{" "}
              <b>Привязанные аккаунты</b> → <b>Facebook</b>
            </li>
            <li>Войдите в Facebook и выберите вашу страницу</li>
            <li>
              <b>Или</b> в Facebook: откройте вашу страницу → <b>Настройки</b> →{" "}
              <b>Привязанные аккаунты</b> → <b>Instagram</b> →{" "}
              <b>Подключить аккаунт</b>
            </li>
          </ol>
          <Tip>
            После привязки в настройках страницы Facebook в разделе
            &quot;Instagram&quot; будет показан ваш привязанный аккаунт.
          </Tip>
        </Step>

        {/* ─── Шаг 4 ─── */}
        <Step number={4} title="Привяжите Telegram к Potolok.ai">
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              Зайдите на{" "}
              <a
                href="https://potolok.ai/dashboard/profile"
                className="text-blue-600 underline"
              >
                potolok.ai/dashboard/profile
              </a>
            </li>
            <li>
              В разделе <b>Telegram</b> нажмите <b>&quot;Привязать&quot;</b>
            </li>
            <li>Откроется Telegram — нажмите &quot;Start&quot; в боте</li>
            <li>Бот подтвердит привязку</li>
          </ol>
        </Step>

        {/* ─── Шаг 5 ─── */}
        <Step number={5} title="Подключите Instagram к боту">
          <p className="mb-3">
            На этом этапе мы подключаем ваш Instagram к нашему боту. Сейчас это
            делается через нас — напишите нам, и мы подключим за 5 минут.
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              Напишите нам в{" "}
              <a
                href="https://wa.me/77007777777"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                WhatsApp
              </a>{" "}
              или{" "}
              <a
                href="https://t.me/potolok_ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Telegram
              </a>
            </li>
            <li>
              Скажите: <b>&quot;Хочу подключить Instagram-бот&quot;</b>
            </li>
            <li>
              Мы пришлём ссылку — вы входите через Facebook и даёте разрешение
            </li>
            <li>Готово! Бот подключён к вашему Instagram</li>
          </ol>
          <Tip>
            Скоро подключение будет автоматическим прямо из личного кабинета.
          </Tip>
        </Step>

        {/* ─── Шаг 6 ─── */}
        <Step number={6} title="Как пользоваться ботом">
          <p className="mb-4">
            После подключения всё просто — работайте через Telegram:
          </p>
          <div className="space-y-4">
            <HowToItem
              step="1"
              text="Отправьте фото или видео потолка в Telegram-бот"
              detail="Лучше через скрепку (как файл) — сохраняется качество"
            />
            <HowToItem
              step="2"
              text="Добавьте описание (по желанию)"
              detail="Текстом или голосовым сообщением: 'Двухуровневый, гостиная, клиент доволен'"
            />
            <HowToItem
              step="3"
              text='Нажмите "Готово"'
              detail="5 AI-агентов создадут текст, хэштеги и подберут время"
            />
            <HowToItem
              step="4"
              text="Проверьте превью и опубликуйте"
              detail="Опубликовать сейчас или запланировать на лучшее время"
            />
          </div>
        </Step>

        {/* ─── Разрешения ─── */}
        <div className="mt-12 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Какие разрешения нужны и зачем
          </h2>
          <div className="text-gray-600 leading-relaxed">
            <p className="mb-4">
              При подключении Instagram вы даёте разрешение на:
            </p>
            <div className="space-y-3">
              <Permission
                name="Публикация контента"
                why="Чтобы бот мог выкладывать фото и видео в ваш Instagram"
              />
              <Permission
                name="Просмотр профиля"
                why="Чтобы бот знал имя аккаунта и мог показывать ссылку"
              />
              <Permission
                name="Управление страницей Facebook"
                why="Instagram API работает через Facebook — это техническое требование"
              />
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Мы <b>не</b> читаем ваши сообщения, <b>не</b> подписываемся на
              людей и <b>не</b> ставим лайки. Бот только публикует контент,
              который вы одобрили.
            </p>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <div className="mt-12 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Частые вопросы
          </h2>
          <div className="space-y-4">
            <FAQ
              q="Это бесплатно?"
              a="Сейчас — да, в тестовом режиме 3 поста в месяц бесплатно. В тарифе PRO+ — 15 постов за 14 990 тг/мес. Для сравнения, SMM-менеджер стоит от 80 000 тг/мес."
            />
            <FAQ
              q="Бот будет постить без моего одобрения?"
              a="Нет. Бот всегда показывает превью с текстом — вы сами решаете: опубликовать, изменить текст или отменить."
            />
            <FAQ
              q="Какое качество фото?"
              a="Если отправлять фото через скрепку (как файл), качество сохраняется полностью. Обычная отправка фото в Telegram сжимает изображение."
            />
            <FAQ
              q="Можно выкладывать видео?"
              a="Да, до 20 МБ. Бот принимает и фото, и видео — можно миксовать в одном посте (карусель)."
            />
            <FAQ
              q="Что если я хочу свой текст?"
              a='Вы можете выбрать "Другой текст" — бот предложит альтернативный вариант. Или просто напишите свой текст боту перед нажатием "Готово".'
            />
            <FAQ
              q="Можно отложить публикацию?"
              a='Да! Нажмите "Запланировать" — бот опубликует в лучшее время для вашей аудитории (утро, обед или вечер).'
            />
          </div>
        </div>

        {/* ─── CTA ─── */}
        <div className="mt-12 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">
            Готовы подключить?
          </p>
          <p className="text-gray-600 mb-4">
            Напишите нам — подключим ваш Instagram за 5 минут
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://t.me/potolok_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Написать в Telegram
            </a>
            <a
              href="https://wa.me/77007777777"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition"
            >
              Написать в WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
          {number}
        </span>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="text-gray-600 leading-relaxed pl-11">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 text-sm text-amber-800">
      <b>Совет:</b> {children}
    </div>
  );
}

function HowToItem({
  step,
  text,
  detail,
}: {
  step: string;
  text: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold">
        {step}
      </span>
      <div>
        <p className="font-medium text-gray-900">{text}</p>
        <p className="text-sm text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function Permission({ name, why }: { name: string; why: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-green-600 mt-0.5">&#10003;</span>
      <div>
        <p className="font-medium text-gray-800">{name}</p>
        <p className="text-sm text-gray-500">{why}</p>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="font-medium text-gray-900 mb-1">{q}</p>
      <p className="text-gray-600 text-sm">{a}</p>
    </div>
  );
}
