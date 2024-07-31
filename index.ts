import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message", async (ctx) => {
  await ctx.reply("Hello, " + ctx.from?.first_name);
});

bot.start();

console.log("Hello via Bun!");
