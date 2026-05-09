import type { Database } from 'better-sqlite3';
import type { AppConfig } from './config.js';
import { getFallbackPlaces } from './data/fallbackPlaces.js';
import { listShownPlacesByKind, recordShownPlace } from './db.js';
import type { PlaceCandidate, ShownPlaceRow } from './types.js';
import { generateInternalId } from './utils/ids.js';
import { shuffle } from './utils/random.js';
import { nowIso } from './utils/time.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
].join(',');

/**
 * Google Places API (New) の pageSize 上限は 20。
 * 多めに取って後段でランダム選定する。
 */
const POOL_SIZE = 20;
const PICK_COUNT = 3;

interface PlacesApiResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
  }>;
}

function buildQuery(kind: 'meal' | 'drink', request: string | null): string {
  const trimmed = request?.trim();
  if (trimmed && trimmed.length > 0) return `${trimmed} 西新宿`;
  return kind === 'drink' ? '居酒屋 西新宿' : 'ご飯 西新宿';
}

async function fetchPlacesPool(
  query: string,
  cfg: AppConfig,
): Promise<PlaceCandidate[]> {
  if (!cfg.googleMapsApiKey) return [];
  const res = await fetch(PLACES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': cfg.googleMapsApiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ja',
      locationBias: {
        circle: {
          center: { latitude: cfg.campusLat, longitude: cfg.campusLng },
          radius: cfg.placesRadiusMeters,
        },
      },
      pageSize: POOL_SIZE,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Places API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as PlacesApiResponse;
  const items = data.places ?? [];
  return items.map<PlaceCandidate>((p) => ({
    name: p.displayName?.text ?? '(名称不明)',
    address: p.formattedAddress ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount:
      typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    googleMapsUrl: p.googleMapsUri ?? null,
    source: 'google',
    placeId: p.id ?? null,
  }));
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * shown_places.place_key の生成。
 * - Google Place ID があれば `google:<id>`
 * - source=fallback は `fallback:<normalized_name>`
 * - それ以外（API レスポンスに id が無いケース）は `text:<name>[:<address>]`
 */
export function getPlaceKey(p: PlaceCandidate): string {
  if (p.placeId) return `google:${p.placeId}`;
  if (p.source === 'fallback') return `fallback:${normalizeKey(p.name)}`;
  const addrPart = p.address ? `:${normalizeKey(p.address)}` : '';
  return `text:${normalizeKey(p.name)}${addrPart}`;
}

function dedupByKey(places: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  for (const p of places) {
    const k = getPlaceKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * 候補プールから n 件を選ぶ。
 * 1) 履歴に無い候補（unseen）をシャッフルして優先採用
 * 2) 不足分は履歴ありの候補から shown_count 昇順 → 同数の中はランダムで補充
 *
 * これにより、毎回同じ3件にはならず、未表示優先＆フェアな再利用ができる。
 */
function rankAndPick(
  candidates: PlaceCandidate[],
  shownMap: Map<string, ShownPlaceRow>,
  n: number,
): PlaceCandidate[] {
  const unseen: PlaceCandidate[] = [];
  const seen: PlaceCandidate[] = [];
  for (const c of candidates) {
    if (shownMap.has(getPlaceKey(c))) seen.push(c);
    else unseen.push(c);
  }

  const unseenShuffled = shuffle(unseen);
  if (unseenShuffled.length >= n) return unseenShuffled.slice(0, n);

  // 履歴ありを shown_count でグループ化（少ないほど優先）
  const seenByCount = new Map<number, PlaceCandidate[]>();
  for (const p of seen) {
    const r = shownMap.get(getPlaceKey(p));
    if (!r) continue;
    const arr = seenByCount.get(r.shownCount);
    if (arr) arr.push(p);
    else seenByCount.set(r.shownCount, [p]);
  }
  const sortedCounts = [...seenByCount.keys()].sort((a, b) => a - b);

  const result: PlaceCandidate[] = [...unseenShuffled];
  for (const count of sortedCounts) {
    const group = seenByCount.get(count) ?? [];
    const shuffledGroup = shuffle(group);
    for (const p of shuffledGroup) {
      result.push(p);
      if (result.length >= n) return result;
    }
  }
  return result;
}

function recordPicks(
  db: Database,
  kind: 'meal' | 'drink',
  picks: PlaceCandidate[],
): void {
  const now = nowIso();
  for (const p of picks) {
    recordShownPlace(db, {
      id: generateInternalId(),
      placeKey: getPlaceKey(p),
      kind,
      name: p.name,
      source: p.source,
      lastShownAt: now,
    });
  }
}

/**
 * meal / drink の店候補を 3 件返す。
 *
 * - GOOGLE_MAPS_API_KEY があれば Places API (New) で pageSize=20 取得し、それをプールにする。
 * - 失敗 / 未設定 / 取得 0 件のときは fallback プール（kind あたり 10 件以上）を使う。
 * - 履歴 (shown_places) を見て未表示の候補を優先しつつランダムに 3 件選ぶ。
 * - 選ばれた 3 件は shown_places に upsert する。
 */
export async function searchPlaces(
  db: Database,
  kind: 'meal' | 'drink',
  request: string | null,
  cfg: AppConfig,
): Promise<PlaceCandidate[]> {
  const query = buildQuery(kind, request);
  let pool: PlaceCandidate[] = [];

  if (cfg.googleMapsApiKey) {
    try {
      pool = await fetchPlacesPool(query, cfg);
    } catch (err) {
      console.error(
        '[places] Google Places API failed, falling back:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  if (pool.length === 0) {
    pool = getFallbackPlaces(kind);
  }

  const deduped = dedupByKey(pool);
  if (deduped.length === 0) return [];

  const shownRows = listShownPlacesByKind(db, kind);
  const shownMap = new Map(shownRows.map((r) => [r.placeKey, r]));

  const picks = rankAndPick(deduped, shownMap, PICK_COUNT);
  recordPicks(db, kind, picks);
  return picks;
}
