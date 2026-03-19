const UTF8_BOM = '\uFEFF';

export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function hasUtf8Bom(text: string): boolean {
  return text.charCodeAt(0) === 0xfeff;
}

export function ensureWindowsUtf8Bom(
  text: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const normalized = stripUtf8Bom(text);
  if (platform !== 'win32') {
    return normalized;
  }
  return `${UTF8_BOM}${normalized}`;
}

export function parseJsonText<T>(text: string): T {
  return JSON.parse(stripUtf8Bom(text)) as T;
}

export function stringifyJsonText(
  value: unknown,
  options: {
    platform?: NodeJS.Platform;
    trailingNewline?: boolean;
  } = {},
): string {
  const serialized = JSON.stringify(value, null, 2);
  const withNewline = options.trailingNewline === false ? serialized : `${serialized}\n`;
  return ensureWindowsUtf8Bom(withNewline, options.platform);
}

export function applyWindowsUtf8Env(
  baseEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  if (platform !== 'win32') {
    return env;
  }

  if (!env.PYTHONIOENCODING?.trim()) {
    env.PYTHONIOENCODING = 'utf-8';
  }
  if (!env.PYTHONUTF8?.trim()) {
    env.PYTHONUTF8 = '1';
  }

  return env;
}
