import { CommandClient } from 'eris';
import { Category } from 'typescript-logging';
import { Config } from '../../Core/Config';
import { Core } from '../..';
import { DiscordVoice } from './Components/Voice';
import { DiscordText } from './Components/Text';

const ERR_MISSING_TOKEN = Error('Discord token missing');

export class Discord {
    private config: Config;
    private bot: CommandClient;
    private logger: Category;
    public audios: { [key: string]: DiscordVoice } = {};

    constructor(core: Core) {
        this.config = core.config;
        this.logger = new Category('Discord', core.mainLogger);

        if (this.config.discord.token === '') throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(
            this.config.discord.token,
            { restMode: true },
            { defaultCommandOptions: { caseInsensitive: true } }
        );

        this.bot.on('ready', async () => {
            this.logger.info(`Logged in as ${this.bot.user.username} (${this.bot.user.id})`);
            this.config.discord.channels.forEach(channel => {
                this.audios[channel.id] = new DiscordVoice(core, this.bot, this.logger, channel);
            });
        });

        // tslint:disable-next-line:no-unused-expression
        new DiscordText(this, this.bot, this.logger);

        this.bot.connect();
    }
}
