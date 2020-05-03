import childProcess from 'child_process';
import Stream from 'stream';
import { Category } from 'typescript-logging';
import { Config } from './Config';
import { Core } from '..';
import LicsonMixer from '../Libs/LicsonMixer/mixer';

const spawn = childProcess.spawn;

export class AudioUtils {
    private logger: Category;
    private config: Config;

    constructor(core: Core) {
        this.config = core.config;
        this.logger = new Category('Audio', core.mainLogger);
    }

    public soundFileStreamGenerator(filePath: string) {
        const outputStream = spawn(require('ffmpeg-static'), [
            '-i', filePath,
            '-f', 's16le',
            '-ac', '2',
            '-acodec', 'pcm_s16le',
            '-ar', '48000',
            '-y', 'pipe:1'
        ])

        if (this.config.debug) {
            outputStream.stderr.on('data', data => this.logger.debug(data.toString()));
        }

        return (outputStream.stdout)
    }

    public async addStreamToChannelPlayMixer(mixer: LicsonMixer, stream: Stream.Readable) {
        const source = mixer.addSource(new Stream.PassThrough());
        stream.on('data',data => {
            source.addBuffer(data);
        })
    }

    public generatePCMtoMP3Stream(stream: Stream.Readable) {
        const outputStream = spawn(require('ffmpeg-static'), [
            '-f', 's16le', // 16-bit raw PCM
            '-ac', '2', // in channels
            '-ar', '48000', // in sample rate
            '-i', '-', // stdin
            '-c:a', 'libmp3lame', //  LAME MP3 encoder
            '-ac', '2', // out channels
            '-ar', '48000', // out sample rate
            '-ab', '320k', // bitrate
            '-f', 'mp3', // MP3 container
            '-' // stdout
        ])

        if (this.config.debug) {
            outputStream.stderr.on('data', data => this.logger.debug(data.toString()));
        }

        stream.pipe(outputStream.stdin);

        return (outputStream.stdout);
    }
}
