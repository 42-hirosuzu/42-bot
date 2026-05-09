import type { PlaceCandidate } from '../types.js';

function gmapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function fallbackEntry(name: string, query: string): PlaceCandidate {
  return {
    name,
    address: '東京都新宿区西新宿 周辺',
    rating: null,
    userRatingCount: null,
    googleMapsUrl: gmapsSearchUrl(query),
    source: 'fallback',
    placeId: null,
  };
}

/**
 * Google Places API キーが無いときの暫定候補。
 * 具体店名は陳腐化しやすいので「カテゴリ × 西新宿」の Google マップ検索リンクを返す。
 * places.ts 側でランダム選定するので、件数を多めに確保している（kind ごとに 10 件以上）。
 */
export const FALLBACK_PLACES_MEAL: PlaceCandidate[] = [
  fallbackEntry('西新宿のラーメン店を探す', 'ラーメン 西新宿'),
  fallbackEntry('西新宿の定食・食堂を探す', '定食 西新宿'),
  fallbackEntry('西新宿のカフェを探す', 'カフェ 西新宿'),
  fallbackEntry('西新宿の寿司店を探す', '寿司 西新宿'),
  fallbackEntry('西新宿の中華料理を探す', '中華 西新宿'),
  fallbackEntry('西新宿の蕎麦・うどんを探す', '蕎麦 うどん 西新宿'),
  fallbackEntry('西新宿のカレー店を探す', 'カレー 西新宿'),
  fallbackEntry('西新宿のイタリアン・ピザを探す', 'イタリアン 西新宿'),
  fallbackEntry('西新宿の韓国料理を探す', '韓国料理 西新宿'),
  fallbackEntry('西新宿の牛丼・丼物を探す', '牛丼 西新宿'),
  fallbackEntry('西新宿の焼肉店を探す', '焼肉 西新宿'),
  fallbackEntry('西新宿のハンバーガーを探す', 'ハンバーガー 西新宿'),
];

export const FALLBACK_PLACES_DRINK: PlaceCandidate[] = [
  fallbackEntry('西新宿の居酒屋を探す', '居酒屋 西新宿'),
  fallbackEntry('西新宿のバーを探す', 'バー 西新宿'),
  fallbackEntry('西新宿のダイニングバーを探す', 'ダイニングバー 西新宿'),
  fallbackEntry('西新宿の立ち飲み屋を探す', '立ち飲み 西新宿'),
  fallbackEntry('西新宿のビアバーを探す', 'ビアバー 西新宿'),
  fallbackEntry('西新宿のワインバーを探す', 'ワインバー 西新宿'),
  fallbackEntry('西新宿の日本酒バーを探す', '日本酒 バー 西新宿'),
  fallbackEntry('西新宿のもつ焼き・ホルモンを探す', 'もつ焼き 西新宿'),
  fallbackEntry('西新宿の焼鳥居酒屋を探す', '焼鳥 居酒屋 西新宿'),
  fallbackEntry('西新宿の角打ち・酒場を探す', '角打ち 酒場 西新宿'),
  fallbackEntry('西新宿のクラフトビールを探す', 'クラフトビール 西新宿'),
];

export function getFallbackPlaces(kind: 'meal' | 'drink'): PlaceCandidate[] {
  return kind === 'drink' ? FALLBACK_PLACES_DRINK : FALLBACK_PLACES_MEAL;
}
