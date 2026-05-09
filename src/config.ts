import 'dotenv/config';

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string;
  databasePath: string;
  tz: string;
  googleMapsApiKey: string | null;
  campusAddress: string;
  campusLat: number;
  campusLng: number;
  placesRadiusMeters: number;
}

// 西新宿2-11-2 付近の概略座標。.env で上書き可能。
const DEFAULT_CAMPUS_LAT = 35.689634;
const DEFAULT_CAMPUS_LNG = 139.692101;

function parseFloatOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  return {
    discordToken: process.env.DISCORD_TOKEN ?? '',
    discordClientId: process.env.DISCORD_CLIENT_ID ?? '',
    discordGuildId: process.env.DISCORD_GUILD_ID ?? '',
    databasePath: process.env.DATABASE_PATH ?? './data/bot.sqlite',
    tz: process.env.TZ ?? 'Asia/Tokyo',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY?.trim() || null,
    campusAddress: process.env.CAMPUS_ADDRESS ?? '東京都新宿区西新宿2丁目11-2',
    campusLat: parseFloatOr(process.env.CAMPUS_LAT, DEFAULT_CAMPUS_LAT),
    campusLng: parseFloatOr(process.env.CAMPUS_LNG, DEFAULT_CAMPUS_LNG),
    placesRadiusMeters: parseIntOr(process.env.PLACES_RADIUS_METERS, 2400),
  };
}

export function ensureRuntimeConfig(cfg: AppConfig): void {
  const missing: string[] = [];
  if (!cfg.discordToken) missing.push('DISCORD_TOKEN');
  if (!cfg.discordClientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
}

export function ensureGuildConfig(cfg: AppConfig): void {
  ensureRuntimeConfig(cfg);
  if (!cfg.discordGuildId) {
    throw new Error('Missing env: DISCORD_GUILD_ID');
  }
}
