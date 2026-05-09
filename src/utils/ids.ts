import { randomBytes } from 'node:crypto';

/**
 * 8文字の16進ID。custom_id（最大100文字）に複数埋め込んでも余裕がある長さ。
 */
export function generateEventId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * place_suggestions など内部参照用のID。
 */
export function generateInternalId(): string {
  return randomBytes(8).toString('hex');
}
