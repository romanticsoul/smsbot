console.log('Hello Bot!');

import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InputFile,
  session,
  type SessionFlavor,
} from 'grammy';
import { hydrate, type HydrateFlavor } from '@grammyjs/hydrate';
import { I18n, type I18nFlavor } from '@grammyjs/i18n';
import { Menu } from '@grammyjs/menu';
import { chunk } from 'lodash';
import { initData, type Country, type Service } from './api/initData';
import _ from 'lodash';
import { setStatus } from './api/setStatus';
import { buyNumber } from './helpers/buyNumber';
import { waitingCode } from './helpers/waitingCode';
import { escapeMarkdownV2 } from './helpers/escapeMarkdownV2';

const init = await initData();

type SessionData = {
  __language_code?: string;
  countryActivePage: number;
  serviceActivePage: number;
  selected_country: Country;
  selected_service?: Service;
  from_buy_number: boolean;
  numberAbortController: {
    [id: string]: AbortController | null;
  };
};

type MyContext = HydrateFlavor<Context> & SessionFlavor<SessionData> & I18nFlavor;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

const i18n = new I18n<MyContext>({
  defaultLocale: 'ru',
  useSession: true,
  directory: 'locales',
});

bot.use(
  session({
    initial: (): SessionData => {
      return {
        countryActivePage: 0,
        serviceActivePage: 0,
        selected_country: init[0],
        from_buy_number: false,
        numberAbortController: {},
      };
    },
  })
);
bot.use(hydrate());
bot.use(i18n);

// * МЕНЮ ПОКУПКИ НОМЕРА
const buyNumberMessage = 'Купить номер';
const buyNumberMenu = new Menu<MyContext>('buy-number-menu');
buyNumberMenu.dynamic(async (ctx, range) => {
  const country = ctx.session.selected_country;
  const service = ctx.session.selected_service;
  console.log(service?.name);

  if (service) {
    range.text('✉ Получить СМС', async (ctx) => {
      const abortControllerId = _.uniqueId();
      const message = await ctx.reply('⌛ Идет поиск свободного номера', {
        reply_markup: new InlineKeyboard().text(
          '🚫 Отмена',
          `cancelNumberFetch-${abortControllerId}`
        ),
      });

      const controller = new AbortController();
      ctx.session.numberAbortController[abortControllerId] = controller;

      buyNumber(country.id, service.id, controller.signal).then(async (data) => {
        if (data) {
          const { id, phone } = data;
          const locale = await ctx.i18n.getLocale();
          const countryName = `${country.emoji} ${
            locale === 'ru' ? country.ru_name : country.en_name
          }`;

          await message.editText(
            ctx.t('activation-success-message', {
              id: id.toString(),
              country: escapeMarkdownV2(countryName),
              service: escapeMarkdownV2(service.name),
              number: phone.toString(),
            }),
            {
              parse_mode: 'MarkdownV2',
              reply_markup: new InlineKeyboard().text(
                '🚫 Вернуть деньги',
                `cancel-purchase:${id}:${phone}:${country.id}:${service.id}`
              ),
            }
          );

          async function waitForCodeAndReply(
            id: number,
            phone: number,
            ctx: MyContext,
            msg: typeof message,
            count: number
          ) {
            const code = await waitingCode(id);
            if (code) {
              if (count === 1) await msg.editReplyMarkup();
              await ctx.reply(ctx.t('activation-code', { code, count }), {
                parse_mode: 'MarkdownV2',
                reply_parameters: {
                  quote: '☎ *Номер:*' + ' ⁨' + phone,
                  quote_parse_mode: 'MarkdownV2',
                  message_id: msg.message_id,
                },
              });

              const status = await setStatus({ id, status: 3 });
              if (status === 'ACCESS_RETRY_GET') {
                waitForCodeAndReply(id, phone, ctx, message, count + 1);
              }
            }
          }

          waitForCodeAndReply(id, phone, ctx, message, 1);
        } else {
          ctx.session.numberAbortController[abortControllerId] = null;
          await message.editText('🚫 Отмена покупки номера');
        }
      });
    });
  }

  range.row();
  range.text('⭐️ Добавить в избранное', async (ctx) => {
    await ctx.reply('⚒ В разработке');
  });
  range.text('🌎 Изменить страну', async (ctx) => {
    ctx.session.from_buy_number = true;
    await openCountryList(ctx);
  });

  range.row();
  range.text('⬅ Назад', async (ctx) => await openServiceList(ctx));
  range.text('🏠 На главную', async (ctx) => await backToMainMenu(ctx));
});

// * МЕНЮ ВЫБОРА СЕРВИСА
const changeServiceMenu = new Menu<MyContext>('change-service-menu');
changeServiceMenu.dynamic(async (ctx, range) => {
  const services = Object.values(ctx.session.selected_country.services);
  if (services.length) {
    const servicesPages = chunk(services, 18);
    const session = await ctx.session;
    servicesPages[session.serviceActivePage].forEach((s, i) => {
      range.text(s.name, async (ctx) => {
        ctx.session.selected_service = s;
        await openServicePage(ctx);
      });

      if (i % 3 === 2) range.row();
    });

    range.row();
    if (session.serviceActivePage > 0) {
      range.submenu('⬅ Назад', 'change-service-menu', () => {
        session.serviceActivePage--;
      });
    } else range.text('ㅤ');

    if (session.serviceActivePage > 0) {
      range.submenu(
        `${session.serviceActivePage + 1}/${servicesPages.length}`,
        'change-service-menu',
        () => (session.serviceActivePage = 0)
      );
    } else range.text(`${session.serviceActivePage + 1}/${servicesPages.length}`);

    if (session.serviceActivePage < servicesPages.length - 1) {
      range.submenu('Далее ➡', 'change-service-menu', () => {
        session.serviceActivePage++;
      });
    } else range.text('ㅤ');
  }

  range.row().text('🏠 На главную', async (ctx) => await backToMainMenu(ctx));
});
changeServiceMenu.register(buyNumberMenu);

// * МЕНЮ ИЗМЕНЕНИЯ СТРАНЫ
const changeCountryMenu = new Menu<MyContext>('change-country-menu');
changeCountryMenu.dynamic(async (ctx, range) => {
  let countriesPages = chunk(Object.values(init), 18);

  if (ctx.session.from_buy_number && ctx.session.selected_service) {
    countriesPages = chunk(
      _.filter(init, (item) => _.has(item.services, ctx.session.selected_service!.id)),
      18
    );
  }

  const session = await ctx.session;
  const locale = await ctx.i18n.getLocale();
  countriesPages[session.countryActivePage].forEach((c, i) => {
    const text = `${c.emoji} ${locale === 'ru' ? c.ru_name : c.en_name}`;

    if (ctx.session.from_buy_number) {
      range.text(text, async (ctx) => {
        ctx.session.selected_country = c;
        await openServicePage(ctx);
      });
    } else {
      range.text(text, async (ctx) => {
        ctx.session.selected_country = c;
        await backToMainMenu(ctx);
      });
    }

    if (i % 3 === 2) range.row();
  });

  range.row();
  if (countriesPages.length > 1) {
    if (session.countryActivePage > 0) {
      range.submenu('⬅ Назад', 'change-country-menu', () => {
        session.countryActivePage--;
      });
    } else range.text('ㅤ');

    if (session.countryActivePage > 0) {
      range.submenu(
        `${session.countryActivePage + 1}/${countriesPages.length}`,
        'change-country-menu',
        () => (session.countryActivePage = 0)
      );
    } else range.text(`${session.countryActivePage + 1}/${countriesPages.length}`);

    if (session.countryActivePage < countriesPages.length - 1) {
      range.submenu('Далее ➡', 'change-country-menu', () => {
        session.countryActivePage++;
      });
    } else range.text('ㅤ');
  }

  range.row();
  if (ctx.session.from_buy_number) {
    range.submenu('⬅ Назад', 'buy-number-menu', (ctx) => {
      ctx.session.from_buy_number = false;
    });
  } else {
    range.text('🏠 На главную', async (ctx) => await backToMainMenu(ctx));
  }
});

// * ГЛАВНОЕ МЕНЮ
const mainMenu = new Menu<MyContext>('main-menu')
  .text('✉ Купить номер', async (ctx) => await openServiceList(ctx))
  .text('⭐️ Избранное', async (ctx) => {
    await ctx.reply('⚒ В разработке');
  })
  .row()
  .text('🌎 Изменить страну', async (ctx) => await openCountryList(ctx))
  .text('💰 Пополнить баланс', async (ctx) => {
    await ctx.reply('⚒ В разработке');
  });

mainMenu.register(changeServiceMenu, 'main-menu');
mainMenu.register(changeCountryMenu);

// * КНОПКА "🏠 МЕНЮ"
const menuButton = new Menu<MyContext>('menu-button').text(
  '🏠 Меню',
  async (ctx) => await backToMainMenu(ctx)
);

bot.use(mainMenu);
bot.use(menuButton);

bot.callbackQuery(/cancelNumberFetch-(.+)/, async (ctx) => {
  const id = ctx.callbackQuery.data.split('-')[1];
  if (ctx.session.numberAbortController[id]) {
    ctx.session.numberAbortController[id].abort();
  }
});

bot.callbackQuery(/cancel-purchase:\d+:\d+:\d+:.+/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [_, id, phone, countryId, serviceId] = ctx.callbackQuery.data.split(':');
  const status = await setStatus({ id: Number(id), status: 8 });

  if (status === 'ACCESS_CANCEL') {
    const locale = await ctx.i18n.getLocale();
    const service = init[Number(countryId)].services[serviceId];
    const country = init[Number(countryId)];
    const countryName = `${country.emoji} ${
      locale === 'ru' ? country.ru_name : country.en_name
    }`;

    await ctx.editMessageText(
      ctx.t('cancellation-message', {
        id: id.toString(),
        country: escapeMarkdownV2(countryName),
        service: escapeMarkdownV2(service.name),
        number: phone.toString(),
      }),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: menuButton,
      }
    );
  } else {
    console.log(status);
  }
});

// * ФУНКЦИИ ОТКРЫТИЯ МЕНЮ
async function openCountryList(ctx: MyContext) {
  ctx.session.countryActivePage = 0;
  await ctx.editMessageCaption({
    caption: ctx.t('change-country'),
    reply_markup: changeCountryMenu,
  });
}

async function openServiceList(ctx: MyContext) {
  ctx.session.from_buy_number = false;
  await ctx.editMessageCaption({
    caption: ctx.t('change-service'),
    reply_markup: changeServiceMenu,
  });
}

async function openServicePage(ctx: MyContext) {
  ctx.session.from_buy_number = true;
  await ctx.editMessageCaption({
    caption: buyNumberMessage,
    reply_markup: buyNumberMenu,
  });
}

async function backToMainMenu(ctx: MyContext) {
  ctx.session.from_buy_number = false;
  ctx.session.serviceActivePage = 0;
  ctx.session.countryActivePage = 0;

  const locale = await ctx.i18n.getLocale();
  const country = ctx.session.selected_country;
  const countryName = `${country.emoji} ${
    locale === 'ru' ? country.ru_name : country.en_name
  }`;

  try {
    await ctx.editMessageCaption({
      caption: ctx.t('main-menu', {
        balance: '⚒ В разработке',
        country: escapeMarkdownV2(countryName),
      }),
      parse_mode: 'MarkdownV2',
      reply_markup: mainMenu,
    });
  } catch (error) {
    await ctx.replyWithPhoto(new InputFile('./assets/banner2.png'), {
      caption: ctx.t('main-menu', {
        balance: '⚒ В разработке',
        country: escapeMarkdownV2(countryName),
      }),
      parse_mode: 'MarkdownV2',
      reply_markup: mainMenu,
    });
  }
}

// * БЛОК ЗАПУСКА БОТА
bot.command('start', async (ctx) => await backToMainMenu(ctx));
bot.start();
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Ошибка в запросе:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Не удалось связаться с Telegram:', e);
  } else {
    console.error('Неизвестная ошибка:', e);
  }
});
