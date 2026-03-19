import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import JSON5 from 'json5';
import { ensureWindowsUtf8Bom, stripUtf8Bom } from './text-encoding';

export function readJson5File<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const raw = stripUtf8Bom(readFileSync(filePath, 'utf-8')).trim();
  if (!raw) {
    return fallback;
  }

  try {
    return JSON5.parse(raw) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON5 file: ${filePath}`, { cause: error });
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  const parentDir = dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(filePath, ensureWindowsUtf8Bom(`${JSON.stringify(value, null, 2)}\n`), 'utf-8');
}
