# fx_record_ts_bot

## How to use

1. Install [node.js](https://nodejs.org/en/) (Recommend using [nvm](https://github.com/nvm-sh/nvm)), [ffmpeg](https://ffmpeg.org/)
2. Clone this repo
3. Install dependencies with `npm install`
4. Build with `npm run build:prod`
5. Run `npm run installMixer` to install Native C++ Mixer (Optional but recommended)
6. Run `npm run start` the first time to generate `config.json`
7. Create and grab your discord bot token [here](https://discordapp.com/developers/applications/)
8. Fill `config.json`
9. Install `pm2` via `npm install -g pm2` (Optional but recommended)
10. Start the bot with `npm run start` or `pm2 reload ecosystem.config.js`