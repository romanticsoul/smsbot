console.log("Запуск бота!");

import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  session,
  type SessionFlavor,
} from "grammy";
import { hydrate, type HydrateFlavor } from "@grammyjs/hydrate";
import { I18n, type I18nFlavor } from "@grammyjs/i18n";
import { Menu } from "@grammyjs/menu";
import { chunk } from "lodash";

type SessionData = {
  __language_code?: string;
};

type MyContext = HydrateFlavor<Context> &
  SessionFlavor<SessionData> &
  I18nFlavor;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

const i18n = new I18n<MyContext>({
  defaultLocale: "ru",
  useSession: true,
  directory: "locales",
});

bot.use(
  session({
    initial: () => {
      return {};
    },
  })
);
bot.use(i18n);
bot.use(hydrate());

// СЕРВИСЫ
const serviceMenu = new Menu<MyContext>("service-menu")
  .back("Назад", (ctx) => ctx.editMessageText(ctx.t("service")))
  .dynamic((ctx, range) => {
    const serviceId = ctx.match;
    range.text(`Купить номер ${serviceId}`);
  });

const pages = chunk([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
const serviceListMenu = new Menu<MyContext>("service-list-menu")
  .dynamic((ctx, range) => {
    pages[0].forEach((service, i) => {
      range.submenu(
        { text: `${service}`, payload: `${service}` },
        "service-menu",
        (ctx) => ctx.editMessageText("Сервис " + service)
      );
      if (i % 3 === 2) range.row();
    });
  })
  .back("На главную", (ctx) => ctx.editMessageText(ctx.t("main")));

serviceListMenu.register(serviceMenu);

// ГЛАВНАЯ
const mainMenu = new Menu<MyContext>("main-menu")
  .submenu("Купить номер", "service-list-menu", (ctx) =>
    ctx.editMessageText(ctx.t("service"))
  )
  .text("Избранное")
  .row()
  .text("Изменить страну")
  .text("Пополнить баланс");

mainMenu.register(serviceListMenu);

bot.use(mainMenu);

bot.command("start", (ctx) => {
  ctx.reply(ctx.t("main"), { reply_markup: mainMenu });
});

bot.start();
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Ошибка в запросе:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Не удалось связаться с Telegram:", e);
  } else {
    console.error("Неизвестная ошибка:", e);
  }
});
