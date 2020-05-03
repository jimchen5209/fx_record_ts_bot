import { Config } from './Core/Config';
import { catService } from './Core/Logger';
import { Telegram } from './Components/Telegram/Core';
import { Discord } from './Components/Discord/Core';

export class Core {
    public readonly mainLogger = catService;
    public readonly config = new Config(this);
    public telegram: Telegram | undefined;
    constructor() {
        try {
            this.telegram = new Telegram(this);
        } catch (error) {
            this.mainLogger.error('Error occurred when connecting to telegram:', error);
        }
        try {
            // tslint:disable-next-line:no-unused-expression
            new Discord(this);
        } catch (error) {
            this.mainLogger.error('Error occurred when connecting to discord:', error);
        }
    }
}

// tslint:disable-next-line:no-unused-expression
new Core();
