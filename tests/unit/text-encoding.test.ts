import { describe, expect, it } from 'vitest';
import {
  applyWindowsUtf8Env,
  ensureWindowsUtf8Bom,
  parseJsonText,
  stringifyJsonText,
  stripUtf8Bom,
} from '@electron/utils/text-encoding';

describe('text encoding helpers', () => {
  it('strips a UTF-8 BOM when present', () => {
    expect(stripUtf8Bom('\uFEFF{"name":"LawClaw"}')).toBe('{"name":"LawClaw"}');
    expect(stripUtf8Bom('{"name":"LawClaw"}')).toBe('{"name":"LawClaw"}');
  });

  it('adds a UTF-8 BOM only on Windows', () => {
    expect(ensureWindowsUtf8Bom('hello', 'win32')).toBe('\uFEFFhello');
    expect(ensureWindowsUtf8Bom('\uFEFFhello', 'win32')).toBe('\uFEFFhello');
    expect(ensureWindowsUtf8Bom('hello', 'linux')).toBe('hello');
  });

  it('parses JSON text even when the file starts with a BOM', () => {
    expect(parseJsonText<{ name: string }>('\uFEFF{"name":"LawClaw"}')).toEqual({
      name: 'LawClaw',
    });
  });

  it('serializes JSON with a trailing newline and Windows BOM', () => {
    expect(stringifyJsonText({ name: 'LawClaw' }, { platform: 'win32' })).toBe(
      '\uFEFF{\n  "name": "LawClaw"\n}\n'
    );
    expect(stringifyJsonText({ name: 'LawClaw' }, { platform: 'linux' })).toBe(
      '{\n  "name": "LawClaw"\n}\n'
    );
  });

  it('injects UTF-8 process env on Windows without overwriting explicit values', () => {
    expect(applyWindowsUtf8Env({}, 'win32')).toMatchObject({
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    });

    expect(
      applyWindowsUtf8Env(
        {
          PYTHONIOENCODING: 'utf-16',
          PYTHONUTF8: '0',
        },
        'win32',
      )
    ).toMatchObject({
      PYTHONIOENCODING: 'utf-16',
      PYTHONUTF8: '0',
    });

    expect(applyWindowsUtf8Env({}, 'darwin')).toEqual({});
  });
});
