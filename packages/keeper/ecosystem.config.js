/**
 * pm2 ecosystem — production keeper processes.
 *
 *   pm2 start ecosystem.config.js          # start all
 *   pm2 logs                               # tail all logs
 *   pm2 save && pm2 startup                # survive server reboots
 *
 * All processes read packages/keeper/.env via dotenv.
 */
module.exports = {
  apps: [
    {
      name: "yp-price-keeper",
      cwd: __dirname,
      script: "npx",
      args: "ts-node src/index.ts --price-only",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30_000,
    },
    {
      name: "yp-harvest",
      cwd: __dirname,
      script: "npx",
      // Mainnet: real harvest cron (daily). Testnet: switch args to "--simulate".
      args: "ts-node src/index.ts",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 60_000,
    },
    {
      name: "yp-liquidation-bot",
      cwd: __dirname,
      script: "npx",
      args: "ts-node src/liquidation-bot.ts --daemon",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30_000,
    },
  ],
};
