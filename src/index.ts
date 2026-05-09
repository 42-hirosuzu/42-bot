import { Client, Events, GatewayIntentBits } from 'discord.js';
import { ensureRuntimeConfig, loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { handleInteraction } from './interactions.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureRuntimeConfig(cfg);

  const db = openDatabase(cfg.databasePath);
  console.log(`[bot] DB initialized at ${cfg.databasePath}`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[bot] logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(interaction, { db, cfg });
  });

  const shutdown = (signal: string) => {
    console.log(`[bot] received ${signal}, shutting down`);
    void client.destroy();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(cfg.discordToken);
}

main().catch((err) => {
  console.error('[bot] fatal:', err);
  process.exit(1);
});
