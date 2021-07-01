import { CommandClient, VoiceConnection, VoiceChannel } from 'eris';
import { Category } from 'logging-ts';
import moment from 'moment-timezone';
import { Core } from '../../..';
import LicsonMixer from '../../../Libs/LicsonMixer/mixer';
import { EventEmitter } from 'events';
import AudioUtils from '../../../Libs/audio';
import AbortStream from '../../../Libs/abort';
import { createWriteStream, mkdirSync, unlinkSync, existsSync, rmdirSync, WriteStream, readFileSync } from 'fs';
import { Silence } from './Silence';

export class DiscordVoice extends EventEmitter {
    private core: Core;
    private bot: CommandClient;
    private logger: Category;
    private channelConfig: { id: string, fileDest: { type: string, id: string, sendAll: boolean, sendPerUser: boolean }[], ignoreUsers: string[] };
    private recvMixer = new LicsonMixer(16, 2, 48000);
    private userMixers: { [key: string]: LicsonMixer } = {};

    constructor(
        core: Core,
        bot: CommandClient,
        logger: Category,
        channelConfig: { id: string, fileDest: { type: string, id: string, sendAll: boolean, sendPerUser: boolean  }[], ignoreUsers: string[] }
    ) {
        super();

        this.core = core;
        this.bot = bot;
        this.logger = logger;
        this.channelConfig = channelConfig;

        this.startAudioSession(this.channelConfig.id);
    }

    private startAudioSession(channelID: string) {
        this.joinVoiceChannel(channelID).then(connection => {
            connection.play(new Silence(), { format: 'opusPackets' });
            this.startRecording(connection);
            this.startSendRecord();
            this.setEndStreamEvents(connection);
        });
    }

    private startRecording(connection: VoiceConnection) {
        connection.receive('pcm').on('data', (data, user) => {
            if (!user || this.channelConfig.ignoreUsers.includes(user)) return;

            let source = this.recvMixer.getSources(user)[0];
            if (!source) {
                this.logger.info(`New user ${user} to record mixer ${this.channelConfig.id}.`);
                source = this.recvMixer.addSource(new AbortStream(64 * 1000 * 8, 64 * 1000 * 4), user);
            }
            source.stream.write(data);

            // if (!this.userMixers[user]) this.newPerUserMixer(user);

            // let perUserSource = this.userMixers[user].getSources(user)[0];
            // if (!source) perUserSource = this.userMixers[user].addSource(new AbortStream(64 * 1000 * 8, 64 * 1000 * 4), user);
            // perUserSource.stream.write(data);
        });
    }

    // private newPerUserMixer(user: string) {
    //     this.logger.info(`New per user mixer ${user} for ${this.channelConfig.id} created.`);
    //     this.userMixers[user] = new LicsonMixer(16, 2, 48000);
    // }

    private startSendRecord() {
        const mp3Stream = AudioUtils.generatePCMtoMP3Stream(this.recvMixer, this.core.config.debug);

        let mp3Start = '';
        let finalMp3Start = '';
        let writeStream: WriteStream;

        if (existsSync(`temp/${this.channelConfig.id}`)) rmdirSync(`temp/${this.channelConfig.id}`, { recursive: true });
        mkdirSync(`temp/${this.channelConfig.id}`);

        const endStream = () => {
            mp3Stream.unpipe();
            writeStream.end();
            finalMp3Start = mp3Start;
            mp3Start = '';
        };

        const startStream = () => {
            mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh-mm-ss');
            writeStream = createWriteStream(`temp/${this.channelConfig.id}/${mp3Start}.mp3`);
            mp3Stream.pipe(writeStream);
        };

        const sendRecordFile = async () => {
            const mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh-mm-ss');
            const time = moment().tz('Asia/Taipei');
            const caption = `Start:${mp3Start}\nEnd:${mp3End}\n\n#Date${time.format('YYYYMMDD')} #Time${time.format('hhmm')} #Year${time.format('YYYY')}`;

            for (const element of this.channelConfig.fileDest) {
                if (element.type === 'telegram' && element.id !== '' && this.core.telegram) {
                    if (element.sendAll) {
                        this.logger.info(`Sending ${finalMp3Start}.mp3 of ${this.channelConfig.id} to telegram ${element.id}`);
                        if (this.core.telegram) await this.core.telegram.sendAudio(element.id, `temp/${this.channelConfig.id}/${finalMp3Start}.mp3`, caption);
                    }
                }
                if (element.type === 'discord' && element.id !== '') {
                    if (element.sendAll) {
                        this.logger.info(`Sending ${finalMp3Start}.mp3 of ${this.channelConfig.id} to discord ${element.id}`);
                        await this.bot.createMessage(element.id, caption, { name: `${finalMp3Start}.mp3`, file: readFileSync(`temp/${this.channelConfig.id}/${finalMp3Start}.mp3`) });
                    }
                }
            }

            unlinkSync(`temp/${this.channelConfig.id}/${finalMp3Start}.mp3`);
            finalMp3Start = '';
        };

        const sendInterval = setInterval(() => {
            endStream();
            startStream();
            sendRecordFile();
        }, 60 * 1000);

        this.on('endSession', () => {
            clearInterval(sendInterval);
            this.logger.info('Sending rest of recording...');
            endStream();
            sendRecordFile();
        });

        startStream();
    }

    private stopSession(channelID:string, connection: VoiceConnection) {
        connection.stopPlaying();
        this.recvMixer.stop();

        this.emit('endSession');

        this.recvMixer = new LicsonMixer(16, 2, 48000);

        // for (const key of Object.keys(this.userMixers)) {
        //     if (!this.userMixers[key]) continue;
        //     this.userMixers[key].destroy();
        //     delete this.userMixers[key];
        // }

        this.bot.leaveVoiceChannel(channelID);
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection> {
        this.logger.info(`Connecting to ${channelID}...`);
        const connection = await this.bot.joinVoiceChannel(channelID);
        connection.on('warn', (message: string) => {
            this.logger.warn(`Warning from ${channelID}: ${message}`);
        });
        connection.on('error', err => {
            this.logger.error(`Error from voice connection ${channelID}: ${err.message}`, err);
        });
        connection.once('disconnect', err => {
            this.logger.error(`Error from voice connection ${channelID}: ${err.message}`, err);
            this.stopSession(channelID, connection);
            setTimeout(() => {
                this.startAudioSession(channelID);
            }, 5 * 1000);
        });
        return connection;
    }

    private endStream(user: string) {
        this.recvMixer.getSources(user)[0]?.stream.end();
    }

    private setEndStreamEvents(connection: VoiceConnection) {
        const guildID = (this.bot.getChannel(this.channelConfig.id) as VoiceChannel).guild.id;
        connection.on('userDisconnect', user => {
            this.endStream(user);
        });

        this.bot.on('voiceChannelSwitch', (member, newChannel) => {
            if (newChannel.guild.id !== guildID) return;
            if (newChannel.id !== this.channelConfig.id) {
                this.endStream(member.id);
            }
        });
    }
}
