import axios from 'axios';
import { readFile } from 'fs/promises';
import TelegramBot from 'node-telegram-bot-api';

if (!process.env.TGPINGBOT) {
  console.error('TGPINGBOT is not set!');
  process.exit(1);
}

if (!process.env.TGPINGBOTUSERS) {
  console.error('TGPINGBOTUSERS is not set!');
  process.exit(1);
}

const INTERVAL = 60 * 60 * 1000; //1h
const validUsers = new Set(process.env.TGPINGBOTUSERS?.split(','));
const bot = new TelegramBot(process.env.TGPINGBOT, { polling: true });

let isJobRunning = false;
let intervalId: NodeJS.Timeout | null = null;

const readSites = async (path: string): Promise<string[]> => {
  try {
    const data = await readFile(path, { encoding: 'utf8' });

    return data
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => !!s);
  } catch (error) {
    return [];
  }
};

const isOnline = async (url: string): Promise<boolean> => {
  try {
    const res = await axios.get(url);
    return res.status < 500 || !!res.data;
  } catch (error) {
    return false;
  }
};

const task = async (chatId: number, notifyOffline = false): Promise<boolean> => {
  if (isJobRunning) return;

  try {
    isJobRunning = true;
    const sites = await readSites('./sites.list');
    for await (const url of sites) {
      console.debug(`test ${url}`);
      const result = await isOnline(url);
      if (result) {
        sendMessage(chatId, `${url} is online!`);
      } else if (notifyOffline) {
        sendMessage(chatId, `${url} is offline!`);
      }
    }
  } finally {
    isJobRunning = false;
  }
};

const sendMessage = (chatId: number, msg: string) => {
  if (bot) {
    bot.sendMessage(chatId, msg);
  }
};

const isValidUsser = (msg: TelegramBot.Message) => {
  return msg.from?.username && validUsers.has(msg.from?.username);
};

bot.addListener('polling_error', (e) => {
  //@ts-ignore
  if (e?.response?.statusCode === 401) {
    console.error('ETELEGRAM: 401 Unauthorized');
    process.exit(1);
  }
});

bot.onText(/\/start/, (msg) => {
  if (isValidUsser(msg)) {
    clearInterval(intervalId);
    intervalId = setInterval(() => task(msg.chat.id), INTERVAL);
    sendMessage(msg.chat.id, `Task was started!`);
  }
});

bot.onText(/\/stop/, (msg) => {
  if (isValidUsser(msg)) {
    clearInterval(intervalId);
    sendMessage(msg.chat.id, `Task was stopped!`);
  }
});

bot.onText(/\/test/, (msg) => {
  if (isValidUsser(msg)) {
    task(msg.chat.id, true);
  }
});
