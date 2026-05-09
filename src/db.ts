import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  EventRow,
  EventStatus,
  ParticipantRow,
  PlaceSuggestionRow,
  ShownPlaceRow,
} from './types.js';

let dbInstance: DatabaseType | null = null;

export function openDatabase(filePath: string): DatabaseType {
  if (dbInstance) return dbInstance;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  dbInstance = db;
  return db;
}

export function getDatabase(): DatabaseType {
  if (!dbInstance) {
    throw new Error('Database is not initialized. Call openDatabase() first.');
  }
  return dbInstance;
}

function initSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      start_text TEXT NOT NULL,
      meetup_text TEXT,
      note TEXT,
      place_request TEXT,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_events_guild_status ON events(guild_id, status);

    CREATE TABLE IF NOT EXISTS participants (
      event_id TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(event_id, discord_user_id)
    );

    CREATE TABLE IF NOT EXISTS place_suggestions (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      name TEXT NOT NULL,
      address TEXT,
      rating REAL,
      user_rating_count INTEGER,
      google_maps_url TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_place_suggestions_event ON place_suggestions(event_id);

    CREATE TABLE IF NOT EXISTS shown_places (
      id TEXT PRIMARY KEY,
      place_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      shown_count INTEGER NOT NULL DEFAULT 1,
      last_shown_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(place_key, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_shown_places_kind ON shown_places(kind);
  `);
}

// --- events ---

interface EventDbRow {
  id: string;
  kind: string;
  title: string;
  start_text: string;
  meetup_text: string | null;
  note: string | null;
  place_request: string | null;
  status: string;
  created_by: string;
  created_by_name: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: EventDbRow): EventRow {
  return {
    id: row.id,
    kind: row.kind as EventRow['kind'],
    title: row.title,
    startText: row.start_text,
    meetupText: row.meetup_text,
    note: row.note,
    placeRequest: row.place_request,
    status: row.status as EventStatus,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertEvent(db: DatabaseType, row: EventRow): void {
  db.prepare(
    `INSERT INTO events
       (id, kind, title, start_text, meetup_text, note, place_request, status,
        created_by, created_by_name, guild_id, channel_id, message_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.kind,
    row.title,
    row.startText,
    row.meetupText,
    row.note,
    row.placeRequest,
    row.status,
    row.createdBy,
    row.createdByName,
    row.guildId,
    row.channelId,
    row.messageId,
    row.createdAt,
    row.updatedAt,
  );
}

export function updateEventMessageId(
  db: DatabaseType,
  id: string,
  messageId: string,
  updatedAt: string,
): void {
  db.prepare(`UPDATE events SET message_id = ?, updated_at = ? WHERE id = ?`).run(
    messageId,
    updatedAt,
    id,
  );
}

export function updateEventStatus(
  db: DatabaseType,
  id: string,
  status: EventStatus,
  updatedAt: string,
): void {
  db.prepare(`UPDATE events SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    updatedAt,
    id,
  );
}

export function getEventById(db: DatabaseType, id: string): EventRow | null {
  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as EventDbRow | undefined;
  return row ? rowToEvent(row) : null;
}

export function listActiveEvents(
  db: DatabaseType,
  guildId: string,
  limit: number,
): EventRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM events WHERE guild_id = ? AND status = 'open'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(guildId, limit) as EventDbRow[];
  return rows.map(rowToEvent);
}

// --- participants ---

interface ParticipantDbRow {
  event_id: string;
  discord_user_id: string;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToParticipant(row: ParticipantDbRow): ParticipantRow {
  return {
    eventId: row.event_id,
    discordUserId: row.discord_user_id,
    displayName: row.display_name,
    status: row.status as ParticipantRow['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertParticipant(db: DatabaseType, row: ParticipantRow): void {
  db.prepare(
    `INSERT INTO participants
       (event_id, discord_user_id, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id, discord_user_id) DO UPDATE SET
       display_name = excluded.display_name,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(
    row.eventId,
    row.discordUserId,
    row.displayName,
    row.status,
    row.createdAt,
    row.updatedAt,
  );
}

export function listParticipants(db: DatabaseType, eventId: string): ParticipantRow[] {
  const rows = db
    .prepare(`SELECT * FROM participants WHERE event_id = ? ORDER BY updated_at ASC`)
    .all(eventId) as ParticipantDbRow[];
  return rows.map(rowToParticipant);
}

// --- place_suggestions ---

interface PlaceSuggestionDbRow {
  id: string;
  event_id: string | null;
  name: string;
  address: string | null;
  rating: number | null;
  user_rating_count: number | null;
  google_maps_url: string | null;
  source: string;
  created_at: string;
}

function rowToPlaceSuggestion(row: PlaceSuggestionDbRow): PlaceSuggestionRow {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    address: row.address,
    rating: row.rating,
    userRatingCount: row.user_rating_count,
    googleMapsUrl: row.google_maps_url,
    source: row.source as PlaceSuggestionRow['source'],
    createdAt: row.created_at,
  };
}

export function insertPlaceSuggestions(
  db: DatabaseType,
  rows: PlaceSuggestionRow[],
): void {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO place_suggestions
       (id, event_id, name, address, rating, user_rating_count, google_maps_url, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMany = db.transaction((items: PlaceSuggestionRow[]) => {
    for (const r of items) {
      stmt.run(
        r.id,
        r.eventId,
        r.name,
        r.address,
        r.rating,
        r.userRatingCount,
        r.googleMapsUrl,
        r.source,
        r.createdAt,
      );
    }
  });
  insertMany(rows);
}

export function listPlaceSuggestionsByEvent(
  db: DatabaseType,
  eventId: string,
): PlaceSuggestionRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM place_suggestions WHERE event_id = ? ORDER BY created_at ASC`,
    )
    .all(eventId) as PlaceSuggestionDbRow[];
  return rows.map(rowToPlaceSuggestion);
}

// --- shown_places ---

interface ShownPlaceDbRow {
  id: string;
  place_key: string;
  kind: string;
  name: string;
  source: string;
  shown_count: number;
  last_shown_at: string;
  created_at: string;
}

function rowToShownPlace(row: ShownPlaceDbRow): ShownPlaceRow {
  return {
    id: row.id,
    placeKey: row.place_key,
    kind: row.kind,
    name: row.name,
    source: row.source as ShownPlaceRow['source'],
    shownCount: row.shown_count,
    lastShownAt: row.last_shown_at,
    createdAt: row.created_at,
  };
}

export function listShownPlacesByKind(
  db: DatabaseType,
  kind: string,
): ShownPlaceRow[] {
  const rows = db
    .prepare(`SELECT * FROM shown_places WHERE kind = ?`)
    .all(kind) as ShownPlaceDbRow[];
  return rows.map(rowToShownPlace);
}

export interface RecordShownPlaceInput {
  id: string;
  placeKey: string;
  kind: string;
  name: string;
  source: 'google' | 'fallback';
  lastShownAt: string;
}

/**
 * 指定の (place_key, kind) を upsert する。
 * 既存行があれば shown_count を +1、last_shown_at を更新。新規行なら shown_count=1。
 */
export function recordShownPlace(
  db: DatabaseType,
  input: RecordShownPlaceInput,
): void {
  db.prepare(
    `INSERT INTO shown_places
       (id, place_key, kind, name, source, shown_count, last_shown_at, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(place_key, kind) DO UPDATE SET
       shown_count = shown_count + 1,
       last_shown_at = excluded.last_shown_at,
       name = excluded.name,
       source = excluded.source`,
  ).run(
    input.id,
    input.placeKey,
    input.kind,
    input.name,
    input.source,
    input.lastShownAt,
    input.lastShownAt,
  );
}
