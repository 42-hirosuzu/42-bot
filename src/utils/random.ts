/**
 * Fisher-Yates shuffle。元配列は変更せず新しい配列を返す。
 * Math.random() を使用するため暗号学的乱数ではない（用途的に十分）。
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}
