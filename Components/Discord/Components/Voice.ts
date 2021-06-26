import { CommandClient, VoiceConnection, VoiceChannel } from 'eris';
import { Category } from 'logging-ts';
import moment from 'moment-timezone';
import { Core } from '../../..';
import LicsonMixer from '../../../Libs/LicsonMixer/mixer';
import AudioUtils from '../../../Libs/audio';
import AbortStream from '../../../Libs/abort';
import { createWriteStream, mkdirSync, unlinkSync, existsSync, rmdirSync } from 'fs';
import { Silence } from './Silence';
export class DiscordVoice {
    private core: Core;
    private bot: CommandClient;
    private logger: Category;
    private channelConfig: { id: string, fileDest: { type: string, id: string }, ignoreUsers: string[] };
    // private playMixer = new LicsonMixer(16, 2, 48000);
    private playMixer = new Silence();
    private recvMixer = new LicsonMixer(16, 2, 48000);
    // private userMixers: { [key: string]: LicsonMixer } = {};
    // private userRawPCMStreams: { [key: string]: Stream.PassThrough } = {};
    // private userRawMP3Streams: { [key: string]: Stream.PassThrough } = {};
    // private userMP3Buffers: { [key: string]: any[] } = {};
    private telegramSendInterval: NodeJS.Timeout | undefined;
    // private clearStreamInterval!: NodeJS.Timeout;

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

        this.startAudioSession(this.channelConfig.id);
    }

    public getUserMP3Buffer(userID: string) {
        // return (this.userMP3Buffers[userID] !== undefined) ? Buffer.concat(this.userMP3Buffers[userID]) : undefined;
    }

    private startAudioSession(channelID: string) {
        this.joinVoiceChannel(channelID).then(connection => {
            connection.play(this.playMixer, { format: 'opusPackets' });
            this.startRecording(connection);
            this.startSendRecord();
            this.setEndStreamEvents(connection);
            // this.startClearStreamInterval();
        });
    }

    // private startPlayMixer(connection: VoiceConnection) {
    //     connection.play((this.playMixer as unknown as Stream.Readable), {
    //         format: 'pcm',
    //         voiceDataTimeout: -1
    //     });
    // }

    public playSound(sound: string) {
        // this.logger.info(`Play ${sound} in voice channel ${this.channelConfig.id}} `);

        // const playStream = AudioUtils.soundFileStreamGenerator(sound, this.core.config.debug);
        // AudioUtils.addStreamToChannelPlayMixer(playStream, this.playMixer);
    }

    private startRecording(connection: VoiceConnection) {
        connection.receive('pcm').on('data', (data, user, time) => {
            if (user === undefined) return;
            // console.log(`User: ${user}, time: ${time}`);
            let source = this.recvMixer.getSources(user)[0];
            if (!source) source = this.recvMixer.addSource(new AbortStream(64 * 1000 * 8, 64 * 1000 * 4), user);
            source.stream.write(data);
        });

        // this.addNewUserToMixer(this.bot.user.id);

        // (this.playMixer as unknown as Stream.Readable).on('data', (data: any) => {
        //     // if (!this.userRawPCMStreams[this.bot.user.id].write(data)) {
        //     //     console.log("userRawPCMStreams write false")
        //     // };
        //     if (!this.userRawMP3Streams[this.bot.user.id].write(data)) {
        //         // console.log("userRawMP3Streams write false")
        //     };
        // });

        // recvStream.on('data', (data, userID, timestamp, sequence) => {
        //     if (userID === undefined || this.channelConfig.ignoreUsers.includes(userID)) return;

        //     if (false || this.userRawMP3Streams[userID] === undefined) {
        //         this.addNewUserToMixer(userID);
        //     }
        //     // if (!this.userRawPCMStreams[userID].write(data)){
        //     //     console.log("userRawPCMStreams write false 2")
        //     // };
        //     if (!this.userRawMP3Streams[userID].write(data)) {
        //         // console.log("userRawMP3Streams write false 2")
        //     };
        // });
    }

    // private addNewUserToMixer(userID: string) {
    //     this.logger.info(`New user ${userID} to record mixer ${this.channelConfig.id}.`);
    //     const userMixer = this.userMixers[userID] = new LicsonMixer(16, 2, 48000);
    //     const userMP3Buffer: any[] = this.userMP3Buffers[userID] = [];
    //     // this.userRawPCMStreams[userID] = new Stream.PassThrough();
    //     this.userRawMP3Streams[userID] = new Stream.PassThrough();

    //     userMixer.addSource(this.userRawMP3Streams[userID], []);
    //     // this.recvMixer.addSource(this.userRawPCMStreams[userID], []);

    //     // AudioUtils.generatePCMtoMP3Stream(userMixer, this.core.config.debug).on('data', (mp3Data: any) => {
    //     //     userMP3Buffer.push(mp3Data);
    //     //     if (userMP3Buffer.length > 4096) userMP3Buffer.splice(0, userMP3Buffer.length - 4096);
    //     // });
    // }

    private startSendRecord() {
        if (this.channelConfig.fileDest.type === 'telegram' && this.channelConfig.fileDest.id !== '' && this.core.telegram !== undefined) {
            const mp3Stream = AudioUtils.generatePCMtoMP3Stream(this.recvMixer, this.core.config.debug);

            let mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');

            if (existsSync('temp')) rmdirSync('temp', { recursive: true });
            mkdirSync('temp');

            let writeStream = createWriteStream(`temp/${mp3Start}.mp3`);
            mp3Stream.pipe(writeStream);

            this.telegramSendInterval = setInterval(() => {
                mp3Stream.unpipe();
                writeStream.end();
                const mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                const caption = `${mp3Start} -> ${mp3End} \n${moment().tz('Asia/Taipei').format('#YYYYMMDD #YYYY')}`;

                this.logger.info(`Sending ${mp3Start}.mp3 of ${this.channelConfig.id} to telegram ${this.channelConfig.fileDest.id}`);
                this.core.telegram?.sendAudio(this.channelConfig.fileDest.id, `temp/${mp3Start}.mp3`, caption).then(i => unlinkSync(i));
                mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                writeStream = createWriteStream(`temp/${mp3Start}.mp3`);
                mp3Stream.pipe(writeStream);
            }, 60 * 1000);
        }
    }

    private stopSession(connection: VoiceConnection) {
        connection.stopPlaying();
        // this.playMixer = new LicsonMixer(16, 2, 48000);
        // this.recvMixer = new LicsonMixer(16, 2, 48000);
        // this.userMixers = {};
        // this.clearStreams();
        // this.userRawPCMStreams = {};
        // this.userRawMP3Streams = {};
        // this.userMP3Buffers = {};
        // connection.removeAllListeners();
        this.recvMixer.destroy();
        this.recvMixer = new LicsonMixer(16, 2, 48000);
        if (this.telegramSendInterval !== undefined) clearInterval(this.telegramSendInterval);
        // clearInterval(this.clearStreamInterval);
        if (connection.channelID) this.bot.leaveVoiceChannel(connection.channelID);
    }

    // private clearStreams() {
    //     for (const user in Object.keys(this.userRawMP3Streams)) {
    //         if (this.userRawMP3Streams[user]) {
    //             this.endStream(user);
    //         }
    //     }
    //     for (const user in Object.keys(this.userRawPCMStreams)) {
    //         if (this.userRawPCMStreams[user]) {
    //             this.endStream(user);
    //         }
    //     }
    // }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection> {
        this.logger.info(`Connecting to ${channelID}...`);
        const connection = await this.bot.joinVoiceChannel(channelID);
        // connection.on('warn', (message: string) => {
        //     this.logger.warn(`Warning from ${channelID}: ${message}`);
        // });
        // const error = (err: Error) => {
        //     this.stopSession(connection);
        //         console.log(err)
        //         setTimeout(() => {
        //             this.startAudioSession(channelID);
        //         }, 5 * 1000);
        // };
        // connection.once('error', error);
        connection.once('disconnect', () => {
            this.stopSession(connection);
            setTimeout(() => {
                this.startAudioSession(channelID);
            }, 5 * 1000);
        });
        return connection;
    }

    private endStream(userID: string) {
        const source = this.recvMixer.getSources(userID)[0];
        if (source) source.stream.end();
        // if (this.userRawPCMStreams[userID]) {
        //     this.userRawPCMStreams[userID].end();
        //     delete this.userRawPCMStreams[userID];
        // }
        // if (this.userRawMP3Streams[userID]) {
        //     this.userRawMP3Streams[userID].end();
        //     delete this.userRawMP3Streams[userID];
        // }
    }

    private setEndStreamEvents(connection: VoiceConnection) {
        const guildID = (this.bot.getChannel(this.channelConfig.id) as VoiceChannel).guild.id;
        connection.on('userDisconnect', userID => {
            this.endStream(userID);
        });

        this.bot.on('voiceChannelSwitch', (member, newChannel) => {
            if (newChannel.guild.id !== guildID) return;
            if (newChannel.id !== this.channelConfig.id) {
                this.endStream(member.id);
            }
        });
    }

    // private startClearStreamInterval() {
    //     this.clearStreamInterval = setInterval(() => {
    //         this.clearStreams();
    //     }, 10 * 60 * 1000);
    // }
}
