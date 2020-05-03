import TelegramBot from 'node-telegram-bot-api';
import { Core } from '../..';
import { Category } from 'typescript-logging';
import { Config } from '../../Core/Config';

const ERR_MISSING_TOKEN = Error('Telegram bot api token not found!');

export class Telegram {
    private bot: TelegramBot;
    private config: Config;
    private logger: Category;

    constructor(core: Core) {
        this.config = core.config;
        this.logger = new Category('Telegram', core.mainLogger);

        if (this.config.telegram.token === '') throw ERR_MISSING_TOKEN;

        this.bot = new TelegramBot(core.config.telegram.token);
    }

    public sendAudio(chatID: string, fileData: Buffer, filename: string, caption: string) {
        this.bot.sendDocument(
            chatID,
            fileData,
            { caption },
            { filename }
        ).catch(err => {
            this.logger.error(err, null);
        })
    }
}
