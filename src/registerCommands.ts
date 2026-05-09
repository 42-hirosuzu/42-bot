import { REST, Routes } from 'discord.js';
import { commandsData } from './commands.js';
import { ensureGuildConfig, loadConfig } from './config.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureGuildConfig(cfg);

  const rest = new REST({ version: '10' }).setToken(cfg.discordToken);

  console.log(
    `[register] Guild ${cfg.discordGuildId} に ${commandsData.length} 個のコマンドを登録します...`,
  );

  const result = (await rest.put(
    Routes.applicationGuildCommands(cfg.discordClientId, cfg.discordGuildId),
    { body: commandsData },
  )) as unknown[];

  console.log(`[register] 完了: ${result.length} 件のコマンドを登録しました`);
  for (const cmd of commandsData) {
    console.log(`  - /${cmd.name}`);
  }
}

main().catch((err) => {
  console.error('[register] failed:', err);
  process.exit(1);
});
