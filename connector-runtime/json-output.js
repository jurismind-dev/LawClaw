function findBalancedJsonEnd(text, startIndex) {
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

export function extractJsonCandidate(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const endIndex = findBalancedJsonEnd(source, index);
    if (endIndex < 0) {
      continue;
    }

    const candidate = source.slice(index, endIndex + 1).trim();
    if (!candidate) {
      continue;
    }

    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Continue scanning in case the output contains a non-JSON bracketed log
      // before the actual JSON payload.
    }
  }

  return '';
}

export function parseJsonFromMixedOutput(text, fallbackValue) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    throw new Error('未在 OpenClaw CLI 输出中找到可解析的 JSON 负载');
  }

  return JSON.parse(candidate);
}
