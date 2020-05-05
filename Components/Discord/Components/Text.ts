import { CommandClient, Message, TextChannel, MessageFile } from 'eris';
import { Category } from 'typescript-logging';
import { DiscordVoice } from './Voice';
import { Discord } from '../Core';
import { SoundFx } from '../../../Core/SoundFX';
import { Core } from '../../..';

const ERR_NOT_IN_VOICE_CHANNEL = 'You are not in any voice channel.';
const ERR_BOT_NOT_IN_VOICE_CHANNEL = 'Bot is not in this channel.'
const ERR_NO_DATA = 'No data.'

export class DiscordText {
    private bot: CommandClient;
    private logger: Category;
    private audios: { [key: string]: DiscordVoice } = {};
    private sound: SoundFx;

    constructor(core: Core, discord: Discord,bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = logger;
        this.audios = discord.audios;
        this.sound = new SoundFx(core);

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
            if (!msg.member.bot) this.handleSoundPlay(msg);
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

        this.bot.registerCommand('showlist', this.commandShowList.bind(this), {
            description: 'Show sound list',
            guildOnly: true,
        })
    }

    private handleSoundPlay(msg: Message) {
        if (!msg.member) return;

        const voiceChannelID = msg.member.voiceState.channelID;
        if (voiceChannelID === undefined) return;
        if (this.audios[voiceChannelID] === undefined) return;

        msg.content.split('\n').forEach(async command => {
            const commandWithArgs = command.split(' ');

            if (commandWithArgs[0] === `<@!${this.bot.user.id}>`) {
                const sound = this.sound.getAssetFromCommand(commandWithArgs[1]);
                if (sound !== undefined) this.audios[voiceChannelID].playSound(sound);
                return;
            }
            this.sound.getSoundKeyWordList().forEach(word => {
                if (command.includes(word)) this.audios[voiceChannelID].playSound(this.sound.getAssetFromKeyWord(word));
            });
        })
    }

    private async commandShowList(msg: Message) {
        if (!msg.member) return;

        const commandList = this.sound.getSoundCommandList().map(value => `${this.bot.user.mention} ${value}`).join('\n');

        msg.channel.createMessage({
            embed: {
                title: 'Sound Available',
                color: 10666230,
                description: `Commands:\n${commandList}\nKeywords:\n${this.sound.getSoundKeyWordList().join('\n')}`
            }
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
