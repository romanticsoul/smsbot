console.log('Hello Bot!');

import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InputFile,
  InputMediaBuilder,
  session,
  type SessionFlavor,
} from 'grammy';
import { hydrate, type HydrateFlavor } from '@grammyjs/hydrate';
import { I18n, type I18nFlavor } from '@grammyjs/i18n';
import { Menu, MenuRange } from '@grammyjs/menu';
import { chunk } from 'lodash';
import { initData, type Country, type Service } from './api/initData';
import _ from 'lodash';
import { setStatus } from './api/setStatus';
import { buyNumber } from './helpers/buyNumber';
import { waitingCode } from './helpers/waitingCode';
import { escapeMarkdownV2 } from './helpers/escapeMarkdownV2';
import qrcode from 'qrcode';
import { createPayment } from './api/createPayment';
import { getPaymentStatus } from './api/getPaymentStatus';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { nanoid } from 'nanoid';

dayjs.locale('ru');
const init = await initData();

const bannerImg = new InputFile('./assets/banner.jpg');

type SessionData = {
  __language_code?: string;
  balance: number;
  countryActivePage: number;
  serviceActivePage: number;
  selected_country: Country;
  selected_service?: Service;
  from_buy_number: boolean;
  abortControllers: {
    [id: string]: AbortController | null;
  };
  activationHistory: {
    [id: number]: {
      id: number;
      phone: number;
      countryId: number;
      serviceId: string;
      status: 'active' | 'success' | 'cancelled';
    };
  };
  favorites: {
    countryId: number;
    serviceId: string;
  }[];
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
        balance: 0,
        countryActivePage: 0,
        serviceActivePage: 0,
        selected_country: init[0],
        from_buy_number: false,
        abortControllers: {},
        activationHistory: {},
        favorites: [],
      };
    },
  })
);
bot.use(hydrate());
bot.use(i18n);

bot.api.setMyCommands([{ command: 'menu', description: '🏠 Открыть главное меню' }]);

// ВЕРСИЯ 3
async function getSmsButtonHandler(countryId: number, serviceId: string, ctx: MyContext) {
  const service = init[Number(countryId)].services[serviceId];
  const country = init[Number(countryId)];

  const abortControllerId = nanoid();
  const controller = new AbortController();
  ctx.session.abortControllers[abortControllerId] = controller;
  const message = await ctx.reply('⌛ Ожидайте, идет поиск свободного номера', {
    // reply_markup: new InlineKeyboard().text(
    //   '🚫 Отмена',
    //   `cancel-rental:${abortControllerId}`
    // ),
  });

  buyNumber(country.id, service.id, controller.signal).then(async (data) => {
    if (data) {
      console.log('Успешная активация');

      const { id, phone } = data;
      const locale = await ctx.i18n.getLocale();
      const countryName = `${country.emoji} ${
        locale === 'ru' ? country.ru_name : country.en_name
      }`;

      ctx.session.abortControllers[abortControllerId]?.abort();
      delete ctx.session.abortControllers[abortControllerId];

      ctx.session.activationHistory[id] = {
        id: id,
        phone: phone,
        countryId: country.id,
        serviceId: service.id,
        status: 'active',
      };

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
            `refund-rental:${id}`
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
        } else {
          console.log(getCurrentTime(), 'ЧЕ');
        }
      }

      waitForCodeAndReply(id, phone, ctx, message, 1);
    }
  });
}

function getCurrentTime(): string {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

// * МЕНЮ ПОКУПКИ НОМЕРА
const buyNumberMenu = new Menu<MyContext>('buy-number-menu');
buyNumberMenu
  .text('✉ Получить смс', async (ctx) => {
    const service = ctx.session.selected_service;
    const country = ctx.session.selected_country;
    if (service) await getSmsButtonHandler(country.id, service.id, ctx);
  })
  // .row()
  // .dynamic(async (ctx, range) => {})
  // .text('⭐️ Добавить в избранное', async (ctx) => {
  //   await ctx.reply('⚒ В разработке');
  // })
  .text('🌎 Изменить страну', async (ctx) => {
    ctx.session.from_buy_number = true;
    await openCountryList(ctx);
  })
  .row()
  .text('⬅ Назад', async (ctx) => await openServiceList(ctx))
  .text('🏠 На главную', async (ctx) => await backToMainMenu(ctx));

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
    } else range.text('ㅤ', () => {});

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
    } else range.text('ㅤ', () => {});
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
    } else range.text('ㅤ', () => {});

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
    } else range.text('ㅤ', () => {});
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

async function openTopUpMenu(ctx: MyContext) {
  await ctx.editMessageCaption({
    caption: 'Выберите сумму на которую хотите пополнить баланс',
    reply_markup: topUpMenu,
  });
}

// * ГЛАВНОЕ МЕНЮ
const mainMenu = new Menu<MyContext>('main-menu')
  .text('✉ Получить смс', async (ctx) => await openServiceList(ctx))
  .text('⭐️ Избранное', async (ctx) => {
    await ctx.reply('⚒ В разработке');
  })
  .row()
  .text('🌎 Изменить страну', async (ctx) => await openCountryList(ctx))
  .text('💰 Пополнить баланс', async (ctx) => await openTopUpMenu(ctx));

mainMenu.register(changeServiceMenu, 'main-menu');
mainMenu.register(changeCountryMenu);

// * МЕНЮ ПОПОЛНЕНИЯ БАЛАНСА
const topUpMenu = new Menu<MyContext>('top-up-menu');
topUpMenu
  .text('50 ₽', async (ctx) => await paymentReceipt(ctx, 50))
  .text('150 ₽', async (ctx) => await paymentReceipt(ctx, 150))
  .text('300 ₽', async (ctx) => await paymentReceipt(ctx, 300))
  .row()
  .text('500 ₽', async (ctx) => await paymentReceipt(ctx, 500))
  .text('1000 ₽', async (ctx) => await paymentReceipt(ctx, 1000))
  .text('Своя сумма')
  .row()
  .text('🏠 На главную', async (ctx) => await backToMainMenu(ctx));

mainMenu.register(topUpMenu);
bot.use(mainMenu);

const inlineMenuButton = new InlineKeyboard().text('🏠 Меню', 'menu');
bot.callbackQuery(/menu/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await backToMainMenu(ctx, true);
});

// bot.callbackQuery(/cancel-rental:[^:]+/, (ctx) => {
//   const id = ctx.callbackQuery.data.split(':')[1];

//   if (ctx.session.abortControllers[id]) {
//     // ctx.deleteMessage();
//     ctx.session.abortControllers[id].abort();
//     delete ctx.session.abortControllers[id];
//   }

//   ctx.answerCallbackQuery();
// });

bot.callbackQuery(/refund-rental:[^:]+/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [_, id] = ctx.callbackQuery.data.split(':');
  const status = await setStatus({ id: Number(id), status: 8 });

  if (status === 'ACCESS_CANCEL') {
    ctx.session.activationHistory[Number(id)].status = 'cancelled';
    const { countryId, serviceId, phone } = ctx.session.activationHistory[Number(id)];

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
        reply_markup: new InlineKeyboard()
          .text('⬅ Назад', `open-activation-page:${countryId}:${serviceId}`)
          .text('🔄 Повторить', `repeat-activation:${id}`)
          .row()
          .text('🏠 На главную', 'menu'),
      }
    );
  } else {
    console.log(status);
  }
});

// * ЧЕК НА ОПЛАТУ
async function paymentReceipt(ctx: MyContext, value: number) {
  const { id, amount, confirmation } = await createPayment(value);

  const buffer = await qrcode.toBuffer(confirmation.confirmation_url, {
    color: { dark: '#ffffff', light: '#000000' },
  });

  const message = await ctx.replyWithPhoto(new InputFile(buffer as any), {
    caption: ctx.t('payment-receipt', {
      value: escapeMarkdownV2(amount.value),
    }),
    parse_mode: 'MarkdownV2',
    reply_markup: new InlineKeyboard().url(
      '🔗 Перейти к оплате',
      confirmation.confirmation_url
    ),
  });

  const timer = setInterval(async () => {
    const data = await getPaymentStatus(id);

    if (data.status != 'pending') {
      clearInterval(timer);
      console.log(data);
      if (data.status === 'succeeded') {
        const date = dayjs(data.captured_at).format('DD MMMM YYYY, HH:mm:ss');
        await message.delete();
        await ctx.reply(
          ctx.t('successful-payment', {
            id: escapeMarkdownV2(id),
            value: escapeMarkdownV2(amount.value),
            balance: escapeMarkdownV2((ctx.session.balance += value).toString()),
            date: escapeMarkdownV2(date),
          }),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: inlineMenuButton,
          }
        );
      }
    }
  }, 3000);
}

// * ФУНКЦИИ ОТКРЫТИЯ МЕНЮ
async function openCountryList(ctx: MyContext) {
  ctx.session.countryActivePage = 0;
  await ctx.editMessageCaption({
    caption: ctx.t('change-country'),
    parse_mode: 'MarkdownV2',
    reply_markup: changeCountryMenu,
  });
}

async function openServiceList(ctx: MyContext) {
  ctx.session.from_buy_number = false;
  await ctx.editMessageCaption({
    caption: ctx.t('change-service'),
    parse_mode: 'MarkdownV2',
    reply_markup: changeServiceMenu,
  });
}

bot.callbackQuery(/repeat-activation:[^:]+/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [_, activationId] = ctx.callbackQuery.data.split(':');
  const { countryId, serviceId } = ctx.session.activationHistory[Number(activationId)];
  await getSmsButtonHandler(countryId, serviceId, ctx);
});

bot.callbackQuery(/open-activation-page:[^:]+:[^:]+/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [_, countryId, serviceId] = ctx.callbackQuery.data.split(':');

  const locale = await ctx.i18n.getLocale();
  const service = init[Number(countryId)].services[serviceId];
  const country = init[Number(countryId)];
  const countryName = `${country.emoji} ${
    locale === 'ru' ? country.ru_name : country.en_name
  }`;

  const caption = ctx.t('buy-number-message', {
    price: service.price,
    service: service.name,
    country: escapeMarkdownV2(countryName),
    balance: ctx.session.balance,
  });

  try {
    await ctx.editMessageCaption({
      caption: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buyNumberMenu,
    });
  } catch (error) {
    await ctx.replyWithPhoto(bannerImg, {
      caption: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buyNumberMenu,
    });
  }
});

async function openServicePage(ctx: MyContext) {
  ctx.session.from_buy_number = true;
  const locale = await ctx.i18n.getLocale();
  const country = ctx.session.selected_country;
  const countryName = `${country.emoji} ${
    locale === 'ru' ? country.ru_name : country.en_name
  }`;

  const caption = ctx.t('buy-number-message', {
    price: ctx.session.selected_service!.price,
    service: ctx.session.selected_service!.name,
    country: escapeMarkdownV2(countryName),
    balance: ctx.session.balance,
  });

  try {
    await ctx.editMessageCaption({
      caption: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buyNumberMenu,
    });
  } catch (error) {
    await ctx.replyWithPhoto(bannerImg, {
      caption: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: buyNumberMenu,
    });
  }
}

async function backToMainMenu(ctx: MyContext, newAnswer = false) {
  ctx.session.from_buy_number = false;
  ctx.session.serviceActivePage = 0;
  ctx.session.countryActivePage = 0;

  const locale = await ctx.i18n.getLocale();
  const country = ctx.session.selected_country;
  const countryName = `${country.emoji} ${
    locale === 'ru' ? country.ru_name : country.en_name
  }`;

  if (newAnswer) {
    await ctx.replyWithPhoto(bannerImg, {
      caption: ctx.t('main-menu', {
        balance: ctx.session.balance,
        country: escapeMarkdownV2(countryName),
      }),
      parse_mode: 'MarkdownV2',
      reply_markup: mainMenu,
    });
  } else {
    try {
      await ctx.editMessageCaption({
        caption: ctx.t('main-menu', {
          balance: ctx.session.balance,
          country: escapeMarkdownV2(countryName),
        }),
        parse_mode: 'MarkdownV2',
        reply_markup: mainMenu,
      });
    } catch (error) {
      await ctx.replyWithPhoto(bannerImg, {
        caption: ctx.t('main-menu', {
          balance: ctx.session.balance,
          country: escapeMarkdownV2(countryName),
        }),
        parse_mode: 'MarkdownV2',
        reply_markup: mainMenu,
      });
    }
  }
}

// * БЛОК ЗАПУСКА БОТА
bot.command('start', async (ctx) => {
  // await ctx.reply('');
  // await ctx.reply('', {});

  const paths = [
    './assets/Пользовательское соглашение.docx',
    './assets/Согласие на обработку персональных данных.docx',
    './assets/Политика обработки персональных данных.docx',
    './assets/Договор оферты.docx',
    './assets/Политика возврата денежных средств.docx',
    './assets/Политика доставки.docx',
  ];
  const files = paths.map((path) => new InputFile(path));
  const media = files.map((file) => InputMediaBuilder.document(file));

  await ctx.replyWithMediaGroup(media);
  await ctx.reply(
    `👋 Добро пожаловать в SMS SIMPLE BOT! Этот бот поможет вам быстро и удобно получать коды активации для регистрации на различных сервисах. Прежде чем начать пользоваться ботом, пожалуйста, ознакомьтесь с основными правилами:

1. Использование сервиса: Услуга заключается в предоставлении кодов активации, а не номеров телефонов. Услуга считается оказанной после получения кода.

2. Запрещенные действия: Сервис категорически запрещено использовать в мошеннических и незаконных целях. Нарушение этого правила может привести к блокировке вашего аккаунта.

3. Политика возврата: Возврат средств возможен только на внутренний баланс в случае неудачной активации или отмены до получения кода.

4. Обработка данных: Используя сервис, вы соглашаетесь с тем, что ваши персональные данные (например, Telegram ID) могут быть обработаны в целях работы сервиса.

Если вы согласны с правилами, нажмите кнопку "Принять" ниже, чтобы продолжить.
    
    `,
    {
      reply_markup: new InlineKeyboard().text('✅ Принять', 'accept'),
    }
  );

  //   await ctx.replyWithDocument(new InputFile('./assets/Пользовательское соглашение.pdf'), {
  //     reply_markup: new InlineKeyboard().text('✅ Принять', 'accept'),
  //     caption: `👋 Добро пожаловать в SMS SIMPLE BOT!

  // 📲 Этот бот поможет вам арендовать временный номер телефона для получения СМС на различных сервисах. Перед началом использования, пожалуйста, ознакомьтесь с нашим Пользовательским соглашением и примите его условия.

  // ✅ Нажмите "Принять", если согласны с условиями и хотите продолжить.`,
  //   });
});

// #

bot.callbackQuery(/accept/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage();
  await backToMainMenu(ctx, true);
});

bot.command('menu', async (ctx) => await backToMainMenu(ctx));
bot.callbackQuery(/delete/, async (ctx) => {
  await ctx.deleteMessage();
});
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
