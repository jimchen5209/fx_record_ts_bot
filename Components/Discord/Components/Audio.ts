import { CommandClient, VoiceConnection } from 'eris';
import { Category } from 'typescript-logging';
import Stream from 'stream';
import moment from 'moment-timezone';
import { Core } from '../../..';
import LicsonMixer from '../../../Libs/LicsonMixer/mixer';
import { AudioUtils } from '../../../Core/AudioUtils';

export class DiscordAudio {
    private core: Core;
    private bot: CommandClient;
    private logger: Category;
    private channelConfig: { id: string, fileDest: { type: string, id: string }, ignoreUsers: string[] };
    private audioUtils: AudioUtils;
    private playMixer = new LicsonMixer(16, 2, 48000);
    private recvMixer = new LicsonMixer(16, 2, 48000);
    private userMixers: { [key: string]: LicsonMixer } = {};
    private userRawPCMStreams: { [key: string]: Stream.PassThrough } = {};
    private userRawMP3Streams: { [key: string]: Stream.PassThrough } = {};
    private userMP3Buffers: { [key: string]: any[] } = {};

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
        this.audioUtils= new AudioUtils(core);

        this.startAudioSession(this.channelConfig.id);
    }

    public getUserMP3Buffer(userID: string) {
        return (this.userMP3Buffers[userID] !== undefined)? Buffer.concat(this.userMP3Buffers[userID]) : undefined;
    }

    private startAudioSession(channelID: string) {
        this.joinVoiceChannel(channelID).then(connection => {
            connection.play((this.playMixer as unknown as Stream.Readable), {
                format: 'pcm',
                voiceDataTimeout: -1
            });

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

                    this.audioUtils.generatePCMtoMP3Stream(userMixer as unknown as Stream.Readable).on('data', mp3Data => {
                        userMP3Buffer.push(mp3Data);
                        if (userMP3Buffer.length > 4096) userMP3Buffer.splice(0, userMP3Buffer.length - 4096);
                    })
                }
                this.userRawPCMStreams[userID].write(data);
                this.userRawMP3Streams[userID].write(data);
            });

            if (this.channelConfig.fileDest.type === 'telegram' && this.channelConfig.fileDest.id !== '' && this.core.telegram !== undefined) {
                let mp3File: any[] = []

                this.audioUtils.generatePCMtoMP3Stream(this.recvMixer as unknown as Stream.Readable).on('data', data => {
                    mp3File.push(data);
                    if (mp3File.length > 4096) mp3File.splice(0, mp3File.length - 4096);
                })

                const sendFile = setInterval(() => {
                    const mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss')
                    const mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss')
                    const caption = `${mp3Start} -> ${mp3End} \n${moment().tz('Asia/Taipei').format('#YYYYMMDD #YYYY')}`
                    const fileName = `${mp3Start} to ${mp3End}.mp3`
                    const fileData = Buffer.concat(mp3File)

                    mp3File = [];
                    this.core.telegram!.sendAudio(this.channelConfig.fileDest.id, fileData, fileName, caption)
                }, 20 * 1000)

                connection.once('disconnect', err => {
                    clearInterval(sendFile)
                })
            }
        });
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection> {
        this.logger.info(`Connecting to ${channelID}...`);
        const connection = await this.bot.joinVoiceChannel(channelID);
        // connection.on('warn', (message: string) => {
        //     this.logger.warn(`Warning from ${channelID}: ${message}`);
        // });
        const error = (err: Error) => {
            connection.stopPlaying();
            connection.removeAllListeners();
            if (err) {
                this.logger.error(`Error from ${channelID}: ${err.name} ${err.message}`, null);
                setTimeout(() => {
                    this.bot.leaveVoiceChannel(channelID);
                    this.startAudioSession(channelID);
                }, 5000);
            }
        };
        connection.once('error', error);
        connection.once('disconnect', error);
        return connection;
    }
}
