import { CommandClient, Message, TextChannel, MessageFile } from 'eris';
import { Category } from 'typescript-logging';
import { DiscordVoice } from './Voice';
import { Discord } from '../Core';

const ERR_NOT_IN_VOICE_CHANNEL = 'You are not in any voice channel.';
const ERR_BOT_NOT_IN_VOICE_CHANNEL = 'Bot is not in this channel.'
const ERR_NO_DATA = 'No data.'

export class DiscordText {
    private bot: CommandClient;
    private logger: Category;
    private audios: { [key: string]: DiscordVoice } = {};

    constructor(discord: Discord,bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = logger;
        this.audios = discord.audios;

        this.bot.on('messageCreate', msg => {

            if (!msg.member) return;

            const channelName = ((msg.channel) as TextChannel).name;
            const channelID = msg.channel.id;

            const userNick = (msg.member.nick) ? msg.member.nick : '';
            const userName = msg.member.user.username;
            const userID = msg.member.user.id;

            const messageContent = msg.content;
            messageContent.split('\n').forEach(content => {
                this.logger.info(`${userNick}[${userName}, ${userID}] => ${channelName} (${channelID}): ${content}`);
            });
        });

        this.registerCommand();
    }

    private registerCommand() {
        this.bot.registerCommand('download', this.commandDownload.bind(this), {
            argsRequired: true,
            description: 'Download user\'s voice',
            guildOnly: true,
            usage: '<userID>',
        });
    }

    private async commandDownload(msg: Message, args: string[]) {
        if (!msg.member) return;

        const voiceChannelID = msg.member.voiceState.channelID;
        if (voiceChannelID === undefined) {
            msg.channel.createMessage(ERR_NOT_IN_VOICE_CHANNEL);
            return;
        }

        if (this.audios[voiceChannelID] === undefined) {
            msg.channel.createMessage(ERR_BOT_NOT_IN_VOICE_CHANNEL);
            return;
        }

        const userID = args[0];
        const buffer = this.audios[voiceChannelID].getUserMP3Buffer(userID);
        if (buffer !== undefined) {
            msg.channel.createMessage('', { file: buffer, name: `${userID}.mp3` } as MessageFile);
        } else {
            msg.channel.createMessage(ERR_NO_DATA);
        }
    }
}
