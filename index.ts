console.log('Hello Bot!');

import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  session,
  type SessionFlavor,
} from 'grammy';
import { hydrate, type HydrateFlavor } from '@grammyjs/hydrate';
import { I18n, type I18nFlavor } from '@grammyjs/i18n';
import { Menu } from '@grammyjs/menu';
import { chunk } from 'lodash';

import services from './JSON/services.json';
import countries from './JSON/countries.json';

import { getServices } from './api/getServices';
import { getPrices } from './api/getPrices';
import { initData } from './api/initData';

type SessionData = {
  __language_code?: string;
  countryActivePage: number;
  serviceActivePage: number;
  selected_country?: (typeof countries)[number];
  selected_service?: (typeof services)[number] & { count: number };
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
        selected_country: countries[0],
      };
    },
  })
);
bot.use(hydrate());
bot.use(i18n);

/**
 *
 * МЕНЮ ПОКУПКИ НОМЕРА
 *
 */

await initData();

const buyNumberMessage = 'Купить номер...';
const buyNumberMenu = new Menu<MyContext>('buy-number-menu');
buyNumberMenu.dynamic(async (ctx, range) => {
  const country = ctx.session.selected_country;
  const service = ctx.session.selected_service;

  if (country && service) {
    const s = await getPrices(country!.id, service!.id);
    console.log(s);
  }

  range.text('Получить СМС');
  range.row();
  range.text('Добавить в избранное');
  range.submenu(
    { text: 'Изменить страну', payload: 'from-buy-number' },
    'change-country-menu',
    (ctx) => ctx.editMessageText(ctx.t('change-country'))
  );

  range.row();
  range.back('Назад', (ctx) => ctx.editMessageText(ctx.t('service')));
  range.submenu('На главную', 'main-menu', (ctx) => ctx.editMessageText(ctx.t('main')));
});

/**
 *
 * МЕНЮ ВЫБОРА СЕРВИСА
 *
 */
const changeServiceMenu = new Menu<MyContext>('change-service-menu');
changeServiceMenu.dynamic(async (ctx, range) => {
  const services = await getServices(ctx.session.selected_country!.id);

  if (services.length) {
    const servicesPages = chunk(services, 18);
    const session = await ctx.session;
    servicesPages[session.serviceActivePage].forEach((s, i) => {
      range.submenu(s.name, 'buy-number-menu', async (ctx) => {
        ctx.session.selected_service = s;
        await ctx.editMessageText(buyNumberMessage);
      });

      if (i % 3 === 2) range.row();
    });

    range.row();
    if (session.serviceActivePage > 0) {
      range.submenu('Назад', 'change-service-menu', () => {
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
      range.submenu('Далее', 'change-service-menu', () => {
        session.serviceActivePage++;
      });
    } else range.text('ㅤ');
  }

  range.row().back('На главную', (ctx) => ctx.editMessageText(ctx.t('main')));
});
changeServiceMenu.register(buyNumberMenu);

/**
 *
 * МЕНЮ ИЗМЕНЕНИЯ СТРАНЫ
 *
 */
const countriesPages = chunk(countries, 18);
const changeCountryMenu = new Menu<MyContext>('change-country-menu');
changeCountryMenu.dynamic(async (ctx, range) => {
  const session = await ctx.session;
  const locale = await ctx.i18n.getLocale();

  countriesPages[session.countryActivePage].forEach((c, i) => {
    const text = `${c.emoji} ${locale === 'ru' ? c.ru_name : c.en_name}`;

    range.submenu(text, 'main-menu', async (ctx) => {
      ctx.session.selected_country = c;
      ctx.session.serviceActivePage = 0;
      await ctx.editMessageText(ctx.t('main'));
    });

    if (i % 3 === 2) range.row();
  });

  range.row();
  if (session.countryActivePage > 0) {
    range.submenu('Назад', 'change-country-menu', () => {
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
    range.submenu('Далее', 'change-country-menu', () => {
      session.countryActivePage++;
    });
  } else range.text('ㅤ');

  range.row().back('На главную', (ctx) => ctx.editMessageText(ctx.t('main')));
});

/**
 *
 * ГЛАВНОЕ МЕНЮ
 *
 */
const mainMenu = new Menu<MyContext>('main-menu')
  .submenu('Купить номер', 'change-service-menu', (ctx) =>
    ctx.editMessageText(ctx.t('service'))
  )
  .text('Избранное')
  .row()
  .submenu('Изменить страну', 'change-country-menu', (ctx) =>
    ctx.editMessageText(ctx.t('change-country'))
  )
  .text('Пополнить баланс');

mainMenu.register(changeServiceMenu, 'main-menu');
mainMenu.register(changeCountryMenu);

bot.use(mainMenu);

/**
 *
 * БЛОК ЗАПУСКА БОТА
 *
 */
bot.command('start', (ctx) => {
  ctx.reply(`${ctx.t('main')}: ${ctx.session.selected_country?.emoji}`, {
    reply_markup: mainMenu,
  });
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
