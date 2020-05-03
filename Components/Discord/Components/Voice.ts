import { CommandClient, VoiceConnection } from 'eris';
import { Category } from 'typescript-logging';
import Stream from 'stream';
import moment from 'moment-timezone';
import { Core } from '../../..';
import LicsonMixer from '../../../Libs/LicsonMixer/mixer';
import AudioUtils from '../../../Libs/audio';
// import { AudioUtils } from '../../../Core/AudioUtils';

export class DiscordVoice {
    private core: Core;
    private bot: CommandClient;
    private logger: Category;
    private channelConfig: { id: string, fileDest: { type: string, id: string }, ignoreUsers: string[] };
    // private audioUtils: AudioUtils;
    private playMixer = new LicsonMixer(16, 2, 48000);
    private recvMixer = new LicsonMixer(16, 2, 48000);
    private userMixers: { [key: string]: LicsonMixer } = {};
    private userRawPCMStreams: { [key: string]: Stream.PassThrough } = {};
    private userRawMP3Streams: { [key: string]: Stream.PassThrough } = {};
    private userMP3Buffers: { [key: string]: any[] } = {};
    private telegramSendInterval: NodeJS.Timeout | undefined;

    constructor(
        core: Core,
        bot: CommandClient,
        logger: Category,
        channelConfig: { id: string, fileDest: { type: string, id: string }, ignoreUsers: string[] }
    ) {
        this.core = core;
        this.bot = bot;
        this.logger = logger;
        this.channelConfig = channelConfig;
        // this.audioUtils = new AudioUtils(core,this.channelConfig.id);

        this.startAudioSession(this.channelConfig.id);
    }

    public getUserMP3Buffer(userID: string) {
        return (this.userMP3Buffers[userID] !== undefined) ? Buffer.concat(this.userMP3Buffers[userID]) : undefined;
    }

    private startAudioSession(channelID: string) {
        this.joinVoiceChannel(channelID).then(connection => {
            this.startPlayMixer(connection);
            this.startRecording(connection);
            this.startSendRecord(connection);
        });
    }

    private startPlayMixer(connection: VoiceConnection) {
        connection.play((this.playMixer as unknown as Stream.Readable), {
            format: 'pcm',
            voiceDataTimeout: -1
        });
    }

    private startRecording(connection: VoiceConnection) {
        const recvStream = connection.receive('pcm');
        recvStream.on('data', (data, userID, timestamp, sequence) => {
            if (userID === undefined || this.channelConfig.ignoreUsers.includes(userID)) return;

            if (this.userRawPCMStreams[userID] === undefined || this.userRawMP3Streams[userID] === undefined) {
                this.logger.info(`New user ${userID} to record mixer ${this.channelConfig.id}.`);
                const userMixer = this.userMixers[userID] = new LicsonMixer(16, 2, 48000);
                const userMP3Buffer: any[] = this.userMP3Buffers[userID] = [];
                this.userRawPCMStreams[userID] = new Stream.PassThrough();
                this.userRawMP3Streams[userID] = new Stream.PassThrough();

                userMixer.addSource(this.userRawMP3Streams[userID]);
                this.recvMixer.addSource(this.userRawPCMStreams[userID]);

                AudioUtils.generatePCMtoMP3Stream(userMixer, this.core.config.debug).on('data', (mp3Data: any) => {
                    userMP3Buffer.push(mp3Data);
                    if (userMP3Buffer.length > 4096) userMP3Buffer.splice(0, userMP3Buffer.length - 4096);
                })
            }
            this.userRawPCMStreams[userID].write(data);
            this.userRawMP3Streams[userID].write(data);
        });
    }

    private startSendRecord(connection: VoiceConnection) {
        if (this.channelConfig.fileDest.type === 'telegram' && this.channelConfig.fileDest.id !== '' && this.core.telegram !== undefined) {
            let mp3File: any[] = [];
            AudioUtils.generatePCMtoMP3Stream(this.recvMixer, this.core.config.debug).on('data', (data: any) => {
                mp3File.push(data);
            });

            this.telegramSendInterval = setInterval(() => {
                const mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                const mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                const caption = `${mp3Start} -> ${mp3End} \n${moment().tz('Asia/Taipei').format('#YYYYMMDD #YYYY')}\n#channel${connection.channelID}`;
                const fileName = `${mp3Start} to ${mp3End}`;
                const fileData = Buffer.concat(mp3File);

                this.logger.info(`Sending ${mp3File.length} data of ${this.channelConfig.id} to telegram ${this.channelConfig.fileDest.id}`);
                mp3File = [];
                this.core.telegram!.sendAudio(this.channelConfig.fileDest.id, fileData, fileName, caption);
            }, 20 * 1000);
        }
    }

    private stopSession(connection: VoiceConnection) {
        connection.stopPlaying();
        this.playMixer = new LicsonMixer(16, 2, 48000);
        this.recvMixer = new LicsonMixer(16, 2, 48000);
        this.userMixers = {};
        this.userRawPCMStreams = {};
        this.userRawMP3Streams = {};
        this.userMP3Buffers = {};
        connection.removeAllListeners();
        if (this.telegramSendInterval !== undefined) clearInterval(this.telegramSendInterval);
        this.bot.leaveVoiceChannel(connection.channelID);
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection> {
        this.logger.info(`Connecting to ${channelID}...`);
        const connection = await this.bot.joinVoiceChannel(channelID);
        // connection.on('warn', (message: string) => {
        //     this.logger.warn(`Warning from ${channelID}: ${message}`);
        // });
        const error = (err: Error) => {
            this.stopSession(connection);
            if (err) {
                this.logger.error(`Error from ${channelID}: ${err.name} ${err.message}`, err);
                setTimeout(() => {
                    this.startAudioSession(channelID);
                }, 5 * 1000);
            }
        };
        connection.once('error', error);
        connection.once('disconnect', error);
        return connection;
    }
}
