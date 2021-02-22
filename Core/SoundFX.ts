import fs from 'fs';
import { Category } from 'logging-ts';
import { Core } from '..';

export class SoundFx {
    private command: { [key: string]: string } = {};
    private keyword: { [key: string]: string } = {};
    // private reaction: { [key: string]: string } = {};
    private logger: Category;

    constructor(core: Core) {
        this.logger = new Category('SoundFx', core.mainLogger);
        this.reload();
    }

    public getSoundCommandList() {
        return Object.keys(this.command);
    }

    public getSoundKeyWordList() {
        return Object.keys(this.keyword);
    }

    // public getSoundReactionList() {
    //     return Object.keys(this.reaction);
    // }

    public getAssetFromCommand(sound: string) {
        return this.command[sound];
    }

    public getAssetFromKeyWord(sound: string) {
        return this.keyword[sound];
    }

    // public getAssetFromReaction(sound: string) {
    //     return this.reaction[sound];
    // }

    public reload() {
        this.logger.info('Loading SoundFx...');
        if (fs.existsSync('./sound.json')) {
            const sound = JSON.parse(fs.readFileSync(`./sound.json`, { encoding: 'utf-8' }));
            this.command = (sound.command) ? sound.command : {};
            this.keyword = (sound.keyword) ? sound.keyword : {};
            // this.reaction = (sound.reaction) ? sound.reaction : {};
            this.write();
        } else {
            this.logger.error('Can\'t load sound.json: File not found.', null);
            this.logger.info('Generating empty sound.json...');
            this.command = {};
            this.keyword = {};
            // this.reaction = {};
            this.write();
        }
    }

    private write() {
        const json = JSON.stringify({
            command: this.command,
            keyword: this.keyword
            // reaction: this.reaction
        }, null, 4);
        fs.writeFileSync('./sound.json', json, 'utf8');
    }
}
