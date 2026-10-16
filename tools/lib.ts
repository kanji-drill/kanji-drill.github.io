import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Master } from '../src/domain/types';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const masterPath = fileURLToPath(new URL('../src/data/words.json', import.meta.url));

/** このモジュールがコマンドとして直接実行されたか */
export function isMain(metaUrl: string): boolean {
  return process.argv[1] !== undefined && fileURLToPath(metaUrl) === resolve(process.argv[1]);
}

export function loadMaster(): Master {
  return JSON.parse(readFileSync(masterPath, 'utf8')) as Master;
}
