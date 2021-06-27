import { CommandClient, VoiceConnection } from 'eris';
import { Category } from 'logging-ts';
import Stream from 'stream';
import moment from 'moment-timezone';
import { Core } from '../../..';
import LicsonMixer from '../../../Libs/LicsonMixer/mixer';
import AudioUtils from '../../../Libs/audio';
import AbortStream from '../../../Libs/abort';
import { createWriteStream, mkdirSync, unlinkSync, existsSync, rmdirSync } from 'fs';


const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Stream.Readable {
    _read() {
        this.push(SILENCE_FRAME);
        this.push(null);
    }
}

export class DiscordVoice {
    private core: Core;
    private bot: CommandClient;
    private logger: Category;
    private channelConfig: { id: string, fileDest: { type: string, id: string }, ignoreUsers: string[] };
    private mixer = new LicsonMixer(16, 2, 48000);

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

    private startAudioSession(channelID: string) {
        this.logger.info(`Connecting to ${channelID}...`);
        this.joinVoice(channelID)
        this.startSendRecord();
    }

    private async joinVoice(channelID: string) {
        const connection = await this.bot.joinVoiceChannel(channelID)
        connection.play(new Silence(), { format: 'pcm' })

        this.startRecording(connection);

        connection.once('ready', () => {
            console.error("Voice connection reconnected.")
            this.bot.leaveVoiceChannel(channelID)
        })

        connection.once('disconnect', err => {
            console.error("Voice connection disconnect:", err)
            this.bot.leaveVoiceChannel(channelID)
            setTimeout(() => {
                this.joinVoice(channelID)
            }, 100);
        })
    }

    private startRecording(connection: VoiceConnection) {
        connection.receive('pcm').on('data', (data, user, time) => {
            if (user === undefined) return;
            let source = this.mixer.getSources(user)[0]
            if (!source) source = this.mixer.addSource(new AbortStream(64 * 1000 * 8, 64 * 1000 * 4), user)
            source.stream.write(data)
        });

        connection.on("userDisconnect", user => this.mixer.getSources(user)[0]?.stream.end())
        // this.bot.on('voiceChannelSwitch', (user, channel) => (channel.id !== this.channelConfig.id) ? this.mixer.getSources(user)[0]?.stream.end() : null);
    }

    private startSendRecord() {
        if (this.channelConfig.fileDest.type === 'telegram' && this.channelConfig.fileDest.id !== '' && this.core.telegram !== undefined) {
            const mp3Stream = AudioUtils.generatePCMtoMP3Stream(this.mixer, this.core.config.debug);

            let mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');

            if (existsSync('temp')) rmdirSync('temp', { recursive: true })
            mkdirSync('temp');

            let writeStream = createWriteStream(`temp/${mp3Start}.mp3`)
            mp3Stream.pipe(writeStream)

            setInterval(() => {
                mp3Stream.unpipe()
                writeStream.end()
                const mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                const caption = `${mp3Start} -> ${mp3End} \n${moment().tz('Asia/Taipei').format('#YYYYMMDD #YYYY')}`;

                this.logger.info(`Sending ${mp3Start}.mp3 of ${this.channelConfig.id} to telegram ${this.channelConfig.fileDest.id}`);
                this.core.telegram!.sendAudio(this.channelConfig.fileDest.id, `temp/${mp3Start}.mp3`, caption).then(i => unlinkSync(i));
                mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss');
                writeStream = createWriteStream(`temp/${mp3Start}.mp3`)
                mp3Stream.pipe(writeStream)
            }, 60 * 1000);
        }
    }

    // Trash
    public playSound(sound: string) {
    }

    public getUserMP3Buffer(userID: string) {
    }
}
