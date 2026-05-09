export type EventKind = 'school' | 'outside' | 'meal' | 'drink';
export type EventStatus = 'open' | 'closed';
export type ParticipantStatus = 'going' | 'maybe' | 'declined' | 'softdrink';

export interface EventRow {
  id: string;
  kind: EventKind;
  title: string;
  startText: string;
  meetupText: string | null;
  note: string | null;
  placeRequest: string | null;
  status: EventStatus;
  createdBy: string;
  createdByName: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantRow {
  eventId: string;
  discordUserId: string;
  displayName: string;
  status: ParticipantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceSuggestionRow {
  id: string;
  eventId: string | null;
  name: string;
  address: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUrl: string | null;
  source: 'google' | 'fallback';
  createdAt: string;
}

export interface PlaceCandidate {
  name: string;
  address: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUrl: string | null;
  source: 'google' | 'fallback';
  /** Google Places API の place id。fallback / API 未取得時は null。 */
  placeId: string | null;
}

/**
 * `/spot` および /hangout で表示した店の履歴。
 * place_key は Google place id、または name(+address) ベースの正規化キー。
 */
export interface ShownPlaceRow {
  id: string;
  placeKey: string;
  kind: string;
  name: string;
  source: 'google' | 'fallback';
  shownCount: number;
  lastShownAt: string;
  createdAt: string;
}

export const KIND_LABELS: Record<EventKind, string> = {
  school: '校舎内',
  outside: '校舎外',
  meal: 'ご飯',
  drink: '飲み',
};

export const KIND_EMOJIS: Record<EventKind, string> = {
  school: '🏫',
  outside: '🚶',
  meal: '🍚',
  drink: '🍺',
};

export const PARTICIPANT_LABELS: Record<ParticipantStatus, string> = {
  going: '参加',
  softdrink: '飲まないで参加',
  maybe: '気になる',
  declined: 'やめる',
};

export const DRINK_WARNING =
  'このイベントは飲酒を伴う可能性があります。\n' +
  '飲まない参加も歓迎です。\n' +
  '飲酒の強要は禁止です。\n' +
  '各自の判断と責任で参加してください。';

export function isEventKind(value: string): value is EventKind {
  return value === 'school' || value === 'outside' || value === 'meal' || value === 'drink';
}

export function isParticipantStatus(value: string): value is ParticipantStatus {
  return value === 'going' || value === 'maybe' || value === 'declined' || value === 'softdrink';
}
