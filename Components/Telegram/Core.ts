import TelegramBot from 'node-telegram-bot-api';
import { Core } from '../..';
// import { Category } from 'logging-ts';
import { Config } from '../../Core/Config';

const ERR_MISSING_TOKEN = Error('Telegram bot api token not found!');

export class Telegram {
    private bot: TelegramBot;
    private config: Config;
    // private logger: Category;

    constructor(core: Core) {
        this.config = core.config;
        // this.logger = new Category('Telegram', core.mainLogger);

        if (this.config.telegram.token === '') throw ERR_MISSING_TOKEN;

        this.bot = new TelegramBot(core.config.telegram.token, { baseApiUrl: 'http://10.121.35.22:8081' });

        this.bot.onText(/\/ping(?:@\w+)?/, msg => this.bot.sendMessage(msg.chat.id, 'pong', { reply_to_message_id: msg.message_id }));
    }

    public async sendAudio(chatID: string, file: string, caption: string) {
        try {
            await this.bot.sendAudio(
                chatID,
                file,
                { caption }
            );
        } catch (err) {
            console.log(err);
        }

        console.log(`Send done: ${file}`);
        return file;
    }
}
