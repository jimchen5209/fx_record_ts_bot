import { CommandClient, Message, TextChannel, PossiblyUncachedTextableChannel } from 'eris'; //MessageFile, MessageContent,
import { Category } from 'logging-ts';
import { DiscordVoice } from './Voice';
import { Discord } from '../Core';
import { SoundFx } from '../../../Core/SoundFX';
import { Core } from '../../..';

// const ERR_NOT_IN_VOICE_CHANNEL = 'You are not in any voice channel.';
// const ERR_BOT_NOT_IN_VOICE_CHANNEL = 'Bot is not in this channel.';
// const ERR_NO_DATA = 'No data.';

export class DiscordText {
    private bot: CommandClient;
    private logger: Category;
    private audios: { [key: string]: DiscordVoice } = {};
    private sound: SoundFx;

    constructor(core: Core, discord: Discord, bot: CommandClient, logger: Category) {
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
        // this.bot.registerCommand('download', this.commandDownload.bind(this), {
        //     argsRequired: true,
        //     description: 'Download user\'s voice',
        //     guildOnly: true,
        //     usage: '<userID>',
        // });

        this.bot.registerCommand('showList', this.commandShowList.bind(this), {
            description: 'Show sound list',
            guildOnly: true,
        });

        this.bot.registerCommand('reload', this.commandReload.bind(this), {
            description: 'Reload sound list',
            guildOnly: true,
        });
    }

    private handleSoundPlay(msg: Message<PossiblyUncachedTextableChannel>) {
        if (!msg.member) return;

        const voiceChannelID = msg.member.voiceState.channelID;
        if (!voiceChannelID) return;
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
        });
    }

    private async commandShowList(msg: Message) {
        if (!msg.member) return;

        const commandList = this.sound.getSoundCommandList().map(value => `${this.bot.user.mention} ${value}`).join('\n');

        msg.channel.createMessage({
            embed: {
                title: 'Sound Available',
                color: 10666230,
                description: `**Commands:**\n${commandList}\n\n**Keywords:**\n${this.sound.getSoundKeyWordList().join('\n')}`
            }
        });
    }

    private async commandReload(msg: Message) {
        if (!msg.member) return;

        const message = await msg.channel.createMessage({
            embed: {
                title: 'Reloading sound list...',
                color: 16312092,
                description: 'Please wait...'
            }
        });

        this.sound.reload();

        const newCommandCount = this.sound.getSoundCommandList().length;
        const newKeyWordCount = this.sound.getSoundKeyWordList().length;

        message.edit({
            embed: {
                title: 'Reload sound list done.',
                color: 4289797,
                description: `There ${((newCommandCount + newKeyWordCount) <= 1) ? 'is' : 'are'} now ${newCommandCount} command${(newCommandCount <= 1) ? '' : 's'} and ${newKeyWordCount} keyword${(newKeyWordCount <= 1) ? '' : 's'} loaded.\nUse "${this.bot.user.mention} showList" to view it.`
            }
        });
    }

    // private async commandDownload(msg: Message, args: string[]) {
    //     if (!msg.member) return;

    //     const voiceChannelID = msg.member.voiceState.channelID;
    //     if (!voiceChannelID) {
    //         msg.channel.createMessage(this.genErrorMessage(ERR_NOT_IN_VOICE_CHANNEL));
    //         return;
    //     }

    //     if (this.audios[voiceChannelID] === undefined) {
    //         msg.channel.createMessage(this.genErrorMessage(ERR_BOT_NOT_IN_VOICE_CHANNEL));
    //         return;
    //     }

    //     const userID = args[0];
    //     const buffer = this.audios[voiceChannelID].getUserMP3Buffer(userID);
    //     if (buffer !== undefined) {
    //         msg.channel.createMessage('', { file: buffer, name: `${userID}.mp3` } as MessageFile);
    //     } else {
    //         msg.channel.createMessage(this.genErrorMessage(ERR_NO_DATA));
    //     }
    // }

    // private genErrorMessage(msg: string) {
    //     return {
    //         embed: {
    //             title: 'Error',
    //             color: 13632027,
    //             description: msg
    //         }
    //     } as MessageContent;
    // }
}
