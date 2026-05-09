import type { Database } from 'better-sqlite3';
import {
  getEventById,
  insertEvent,
  insertPlaceSuggestions,
  listActiveEvents,
  listParticipants,
  listPlaceSuggestionsByEvent,
  updateEventStatus,
  upsertParticipant,
} from './db.js';
import type {
  EventKind,
  EventRow,
  ParticipantRow,
  ParticipantStatus,
  PlaceCandidate,
  PlaceSuggestionRow,
} from './types.js';
import { generateEventId, generateInternalId } from './utils/ids.js';
import { nowIso } from './utils/time.js';

export interface CreateEventInput {
  kind: EventKind;
  title: string;
  startText: string;
  meetupText: string | null;
  note: string | null;
  placeRequest: string | null;
  createdBy: string;
  createdByName: string;
  guildId: string;
  channelId: string;
}

export function createEventRecord(
  db: Database,
  input: CreateEventInput,
): EventRow {
  const now = nowIso();
  const event: EventRow = {
    id: generateEventId(),
    kind: input.kind,
    title: input.title,
    startText: input.startText,
    meetupText: input.meetupText,
    note: input.note,
    placeRequest: input.placeRequest,
    status: 'open',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    guildId: input.guildId,
    channelId: input.channelId,
    messageId: null,
    createdAt: now,
    updatedAt: now,
  };
  insertEvent(db, event);
  return event;
}

export function attachPlaceSuggestions(
  db: Database,
  eventId: string,
  candidates: PlaceCandidate[],
): PlaceSuggestionRow[] {
  const now = nowIso();
  const rows: PlaceSuggestionRow[] = candidates.map((c) => ({
    id: generateInternalId(),
    eventId,
    name: c.name,
    address: c.address,
    rating: c.rating,
    userRatingCount: c.userRatingCount,
    googleMapsUrl: c.googleMapsUrl,
    source: c.source,
    createdAt: now,
  }));
  insertPlaceSuggestions(db, rows);
  return rows;
}

export function setRsvp(
  db: Database,
  eventId: string,
  userId: string,
  displayName: string,
  newStatus: ParticipantStatus,
): void {
  const now = nowIso();
  const existing = listParticipants(db, eventId).find(
    (p) => p.discordUserId === userId,
  );
  const created = existing?.createdAt ?? now;
  upsertParticipant(db, {
    eventId,
    discordUserId: userId,
    displayName,
    status: newStatus,
    createdAt: created,
    updatedAt: now,
  });
}

export type CloseEventReason = 'not_found' | 'forbidden' | 'already_closed';

export interface CloseEventResult {
  ok: boolean;
  reason?: CloseEventReason;
  event?: EventRow;
}

export function closeEventByCreator(
  db: Database,
  eventId: string,
  requesterId: string,
): CloseEventResult {
  const event = getEventById(db, eventId);
  if (!event) return { ok: false, reason: 'not_found' };
  if (event.createdBy !== requesterId)
    return { ok: false, reason: 'forbidden', event };
  if (event.status === 'closed')
    return { ok: false, reason: 'already_closed', event };
  updateEventStatus(db, eventId, 'closed', nowIso());
  const refreshed = getEventById(db, eventId);
  return { ok: true, event: refreshed ?? event };
}

export interface EventDetail {
  event: EventRow;
  participants: ParticipantRow[];
  places: PlaceSuggestionRow[];
}

export function getEventDetail(
  db: Database,
  eventId: string,
): EventDetail | null {
  const event = getEventById(db, eventId);
  if (!event) return null;
  return {
    event,
    participants: listParticipants(db, eventId),
    places: listPlaceSuggestionsByEvent(db, eventId),
  };
}

export function listActiveEventsForGuild(
  db: Database,
  guildId: string,
  limit = 10,
): EventRow[] {
  return listActiveEvents(db, guildId, limit);
}
