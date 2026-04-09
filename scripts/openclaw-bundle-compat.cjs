const {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} = require('fs');
const { dirname, join, relative } = require('path');

const DOUBAO_DEFAULT_BASE_URL = 'http://101.132.245.215:3001/v1';
const DOUBAO_DEFAULT_MODEL = 'doubao';
const JURISMIND_WEB_SEARCH_PLUGIN_ID = 'jurismind';
const JURISMIND_WEB_SEARCH_PLUGIN_MARKER = 'lawclaw jurismind web search plugin v1';
const WINDOWS_SPAWN_PATCH_MARKER = 'lawclaw windows spawn patch v1';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addRequireCompatToExportMap(exportMap, entry) {
  if (!isPlainObject(exportMap)) return exportMap;

  const next = { ...exportMap };
  if (!Object.prototype.hasOwnProperty.call(next, 'require')) {
    next.require = entry;
  }
  if (!Object.prototype.hasOwnProperty.call(next, 'default')) {
    next.default = entry;
  }

  return next;
}

function patchRequireCompatiblePackage(nodeModulesDir, packageName, entry = './dist/index.js') {
  const packageJsonPath = join(nodeModulesDir, ...packageName.split('/'), 'package.json');
  if (!existsSync(packageJsonPath)) return false;

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  let patched = false;

  if (!pkg.main) {
    pkg.main = entry;
    patched = true;
  }

  if (typeof pkg.exports === 'string') {
    pkg.exports = {
      import: pkg.exports,
      require: entry,
      default: entry,
    };
    patched = true;
  } else if (isPlainObject(pkg.exports)) {
    if (Object.prototype.hasOwnProperty.call(pkg.exports, '.')) {
      const nextRootExport = addRequireCompatToExportMap(pkg.exports['.'], entry);
      if (JSON.stringify(nextRootExport) !== JSON.stringify(pkg.exports['.'])) {
        pkg.exports = {
          ...pkg.exports,
          '.': nextRootExport,
        };
        patched = true;
      }
    } else {
      const nextExports = addRequireCompatToExportMap(pkg.exports, entry);
      if (JSON.stringify(nextExports) !== JSON.stringify(pkg.exports)) {
        pkg.exports = nextExports;
        patched = true;
      }
    }
  }

  if (!patched) return false;

  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return true;
}

function pathExistsIncludingBrokenSymlink(targetPath) {
  try {
    lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function listNodeModulesPackages(nodeModulesDir) {
  if (!existsSync(nodeModulesDir)) {
    return [];
  }

  const packages = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = join(nodeModulesDir, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name.startsWith('@')) {
      for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
        if (!scopedEntry.isDirectory()) {
          continue;
        }

        packages.push({
          name: `${entry.name}/${scopedEntry.name}`,
          dirPath: join(entryPath, scopedEntry.name),
        });
      }
      continue;
    }

    packages.push({
      name: entry.name,
      dirPath: entryPath,
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function ensureNodeModulesSymlink(sourceDir, targetDir) {
  if (pathExistsIncludingBrokenSymlink(targetDir)) {
    return false;
  }

  mkdirSync(dirname(targetDir), { recursive: true });
  const symlinkTarget =
    process.platform === 'win32'
      ? sourceDir
      : relative(dirname(targetDir), sourceDir) || '.';
  symlinkSync(
    symlinkTarget,
    targetDir,
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  return true;
}

function patchOpenClawExtensionRuntimeDeps(openClawDir) {
  const extensionsDir = join(openClawDir, 'dist', 'extensions');
  if (!existsSync(extensionsDir)) {
    return [];
  }

  const rootNodeModulesDir = join(openClawDir, 'node_modules');
  mkdirSync(rootNodeModulesDir, { recursive: true });

  const bridgedPackages = [];
  const extensionDirs = readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const extensionName of extensionDirs) {
    const extensionNodeModulesDir = join(extensionsDir, extensionName, 'node_modules');
    for (const pkg of listNodeModulesPackages(extensionNodeModulesDir)) {
      const targetDir = join(rootNodeModulesDir, ...pkg.name.split('/'));
      if (!ensureNodeModulesSymlink(pkg.dirPath, targetDir)) {
        continue;
      }

      bridgedPackages.push(pkg.name);
    }
  }

  return bridgedPackages;
}

function replaceRequired(content, filePath, label, before, after) {
  if (content.includes(after)) {
    return { content, changed: false };
  }

  if (!content.includes(before)) {
    throw new Error(`[openclaw-runtime-patch] Missing ${label} marker in ${filePath}`);
  }

  return {
    content: content.replace(before, after),
    changed: true,
  };
}

function writePatchedFile(filePath, content, changed) {
  if (!changed) return false;
  writeFileSync(filePath, content, 'utf8');
  return true;
}

function patchRuntimeWebSearchChunk(filePath) {
  const original = readFileSync(filePath, 'utf8');
  if (original.includes('DEFAULT_DOUBAO_BASE_URL')) {
    return false;
  }

  let content = original;
  let changed = false;

  const replacements = [
    {
      label: 'doubao secret target',
      before: `\t{\n\t\tid: "tools.web.search.perplexity.apiKey",`,
      after: `\t{\n\t\tid: "tools.web.search.doubao.apiKey",\n\t\ttargetType: "tools.web.search.doubao.apiKey",\n\t\tconfigFile: "openclaw.json",\n\t\tpathPattern: "tools.web.search.doubao.apiKey",\n\t\tsecretShape: SECRET_INPUT_SHAPE,\n\t\texpectedResolvedValue: "string",\n\t\tincludeInPlan: true,\n\t\tincludeInConfigure: true,\n\t\tincludeInAudit: true\n\t},\n\t{\n\t\tid: "tools.web.search.perplexity.apiKey",`,
    },
    {
      label: 'doubao search provider enum',
      before: `\t\tz.literal("gemini"),\n\t\tz.literal("kimi")\n\t]).optional(),`,
      after: `\t\tz.literal("gemini"),\n\t\tz.literal("kimi"),\n\t\tz.literal("doubao")\n\t]).optional(),`,
    },
    {
      label: 'doubao search schema object',
      before: `\tkimi: z.object({\n\t\tapiKey: SecretInputSchema$1.optional().register(sensitive),\n\t\tbaseUrl: z.string().optional(),\n\t\tmodel: z.string().optional()\n\t}).strict().optional(),\n\tbrave: z.object({ mode: z.union([z.literal("web"), z.literal("llm-context")]).optional() }).strict().optional()`,
      after: `\tkimi: z.object({\n\t\tapiKey: SecretInputSchema$1.optional().register(sensitive),\n\t\tbaseUrl: z.string().optional(),\n\t\tmodel: z.string().optional()\n\t}).strict().optional(),\n\tdoubao: z.object({\n\t\tapiKey: SecretInputSchema$1.optional().register(sensitive),\n\t\tbaseUrl: z.string().optional(),\n\t\tmodel: z.string().optional()\n\t}).strict().optional(),\n\tbrave: z.object({ mode: z.union([z.literal("web"), z.literal("llm-context")]).optional() }).strict().optional()`,
    },
    {
      label: 'doubao provider list',
      before: `const WEB_SEARCH_PROVIDERS = [\n\t"brave",\n\t"gemini",\n\t"grok",\n\t"kimi",\n\t"perplexity"\n];`,
      after: `const WEB_SEARCH_PROVIDERS = [\n\t"brave",\n\t"gemini",\n\t"grok",\n\t"kimi",\n\t"doubao",\n\t"perplexity"\n];`,
    },
    {
      label: 'doubao provider normalization',
      before: `\tif (normalized === "brave" || normalized === "gemini" || normalized === "grok" || normalized === "kimi" || normalized === "perplexity") return normalized;`,
      after: `\tif (normalized === "brave" || normalized === "gemini" || normalized === "grok" || normalized === "kimi" || normalized === "doubao" || normalized === "perplexity") return normalized;`,
    },
    {
      label: 'doubao env fallback mapping',
      before: `\tif (provider === "grok") return ["XAI_API_KEY"];\n\tif (provider === "kimi") return ["KIMI_API_KEY", "MOONSHOT_API_KEY"];\n\treturn ["PERPLEXITY_API_KEY", "OPENROUTER_API_KEY"];`,
      after: `\tif (provider === "grok") return ["XAI_API_KEY"];\n\tif (provider === "kimi") return ["KIMI_API_KEY", "MOONSHOT_API_KEY"];\n\tif (provider === "doubao") return ["JURISMIND_API_KEY"];\n\treturn ["PERPLEXITY_API_KEY", "OPENROUTER_API_KEY"];`,
    },
    {
      label: 'doubao defaults',
      before: `const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";\nconst DEFAULT_KIMI_MODEL = "moonshot-v1-128k";\nconst KIMI_WEB_SEARCH_TOOL = {`,
      after: `const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";\nconst DEFAULT_KIMI_MODEL = "moonshot-v1-128k";\nconst DEFAULT_DOUBAO_BASE_URL = "${DOUBAO_DEFAULT_BASE_URL}";\nconst DEFAULT_DOUBAO_MODEL = "${DOUBAO_DEFAULT_MODEL}";\nconst KIMI_WEB_SEARCH_TOOL = {`,
    },
    {
      label: 'doubao missing key message',
      before: `\tif (provider === "kimi") return {\n\t\terror: "missing_kimi_api_key",\n\t\tmessage: "web_search (kimi) needs a Moonshot API key. Set KIMI_API_KEY or MOONSHOT_API_KEY in the Gateway environment, or configure tools.web.search.kimi.apiKey.",\n\t\tdocs: "https://docs.openclaw.ai/tools/web"\n\t};\n\treturn {`,
      after: `\tif (provider === "kimi") return {\n\t\terror: "missing_kimi_api_key",\n\t\tmessage: "web_search (kimi) needs a Moonshot API key. Set KIMI_API_KEY or MOONSHOT_API_KEY in the Gateway environment, or configure tools.web.search.kimi.apiKey.",\n\t\tdocs: "https://docs.openclaw.ai/tools/web"\n\t};\n\tif (provider === "doubao") return {\n\t\terror: "missing_doubao_api_key",\n\t\tmessage: "web_search (doubao) needs a Jurismind API key. Set JURISMIND_API_KEY in the Gateway environment, or configure tools.web.search.doubao.apiKey.",\n\t\tdocs: "https://docs.openclaw.ai/tools/web"\n\t};\n\treturn {`,
    },
    {
      label: 'doubao provider resolution',
      before: `\tif (raw === "grok") return "grok";\n\tif (raw === "kimi") return "kimi";\n\tif (raw === "perplexity") return "perplexity";`,
      after: `\tif (raw === "grok") return "grok";\n\tif (raw === "kimi") return "kimi";\n\tif (raw === "doubao") return "doubao";\n\tif (raw === "perplexity") return "perplexity";`,
    },
    {
      label: 'doubao auto detect',
      before: `\t\tif (resolveKimiApiKey(resolveKimiConfig(search))) {\n\t\t\tlogVerbose("web_search: no provider configured, auto-detected \\"kimi\\" from available API keys");\n\t\t\treturn "kimi";\n\t\t}\n\t\tconst { apiKey: perplexityKey } = resolvePerplexityApiKey(resolvePerplexityConfig(search));`,
      after: `\t\tif (resolveKimiApiKey(resolveKimiConfig(search))) {\n\t\t\tlogVerbose("web_search: no provider configured, auto-detected \\"kimi\\" from available API keys");\n\t\t\treturn "kimi";\n\t\t}\n\t\tif (resolveDoubaoApiKey(resolveDoubaoConfig(search))) {\n\t\t\tlogVerbose("web_search: no provider configured, auto-detected \\"doubao\\" from available API keys");\n\t\t\treturn "doubao";\n\t\t}\n\t\tconst { apiKey: perplexityKey } = resolvePerplexityApiKey(resolvePerplexityConfig(search));`,
    },
    {
      label: 'doubao config resolver',
      before: `function resolveKimiBaseUrl(kimi) {\n\treturn (kimi && "baseUrl" in kimi && typeof kimi.baseUrl === "string" ? kimi.baseUrl.trim() : "") || DEFAULT_KIMI_BASE_URL;\n}\nfunction resolveGeminiConfig(search) {`,
      after: `function resolveKimiBaseUrl(kimi) {\n\treturn (kimi && "baseUrl" in kimi && typeof kimi.baseUrl === "string" ? kimi.baseUrl.trim() : "") || DEFAULT_KIMI_BASE_URL;\n}\nfunction resolveDoubaoConfig(search) {\n\tif (!search || typeof search !== "object") return {};\n\tconst doubao = "doubao" in search ? search.doubao : void 0;\n\tif (!doubao || typeof doubao !== "object") return {};\n\treturn doubao;\n}\nfunction resolveDoubaoApiKey(doubao) {\n\tconst fromConfig = normalizeApiKey(doubao?.apiKey);\n\tif (fromConfig) return fromConfig;\n\treturn normalizeApiKey(process.env.JURISMIND_API_KEY) || void 0;\n}\nfunction resolveDoubaoModel(doubao) {\n\treturn (doubao && "model" in doubao && typeof doubao.model === "string" ? doubao.model.trim() : "") || DEFAULT_DOUBAO_MODEL;\n}\nfunction resolveDoubaoBaseUrl(doubao) {\n\treturn (doubao && "baseUrl" in doubao && typeof doubao.baseUrl === "string" ? doubao.baseUrl.trim() : "") || DEFAULT_DOUBAO_BASE_URL;\n}\nfunction resolveGeminiConfig(search) {`,
    },
    {
      label: 'doubao search runner',
      before: `function extractKimiMessageText(message) {`,
      after: `async function runDoubaoSearch(params) {\n\tconst endpoint = \`\${params.baseUrl.trim().replace(/\\/$/, "")}/responses\`;\n\tconst body = {\n\t\tmodel: params.model,\n\t\ttools: [{ type: "web_search" }],\n\t\tinput: params.query\n\t};\n\treturn withTrustedWebSearchEndpoint({\n\t\turl: endpoint,\n\t\ttimeoutSeconds: params.timeoutSeconds,\n\t\tinit: {\n\t\t\tmethod: "POST",\n\t\t\theaders: {\n\t\t\t\t"Content-Type": "application/json",\n\t\t\t\tAuthorization: \`Bearer \${params.apiKey}\`\n\t\t\t},\n\t\t\tbody: JSON.stringify(body)\n\t\t}\n\t}, async (res) => {\n\t\tif (!res.ok) return await throwWebSearchApiError(res, "Doubao");\n\t\tconst data = await res.json();\n\t\tconst { text: extractedText, annotationCitations } = extractGrokContent(data);\n\t\treturn {\n\t\t\tcontent: extractedText ?? data.output_text ?? "No response",\n\t\t\tcitations: (data.citations ?? []).length > 0 ? data.citations : annotationCitations\n\t\t};\n\t});\n}\nfunction extractKimiMessageText(message) {`,
    },
    {
      label: 'doubao cache key',
      before: `const providerSpecificKey = params.provider === "perplexity" ? \`\${params.perplexityTransport ?? "search_api"}:\${params.perplexityBaseUrl ?? PERPLEXITY_DIRECT_BASE_URL}:\${params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL}\` : params.provider === "grok" ? \`\${params.grokModel ?? DEFAULT_GROK_MODEL}:\${String(params.grokInlineCitations ?? false)}\` : params.provider === "gemini" ? params.geminiModel ?? DEFAULT_GEMINI_MODEL : params.provider === "kimi" ? \`\${params.kimiBaseUrl ?? DEFAULT_KIMI_BASE_URL}:\${params.kimiModel ?? DEFAULT_KIMI_MODEL}\` : "";`,
      after: `const providerSpecificKey = params.provider === "perplexity" ? \`\${params.perplexityTransport ?? "search_api"}:\${params.perplexityBaseUrl ?? PERPLEXITY_DIRECT_BASE_URL}:\${params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL}\` : params.provider === "grok" ? \`\${params.grokModel ?? DEFAULT_GROK_MODEL}:\${String(params.grokInlineCitations ?? false)}\` : params.provider === "gemini" ? params.geminiModel ?? DEFAULT_GEMINI_MODEL : params.provider === "kimi" ? \`\${params.kimiBaseUrl ?? DEFAULT_KIMI_BASE_URL}:\${params.kimiModel ?? DEFAULT_KIMI_MODEL}\` : params.provider === "doubao" ? \`\${params.doubaoBaseUrl ?? DEFAULT_DOUBAO_BASE_URL}:\${params.doubaoModel ?? DEFAULT_DOUBAO_MODEL}\` : "";`,
    },
    {
      label: 'doubao runWebSearch branch',
      before: `\tif (params.provider === "gemini") {`,
      after: `\tif (params.provider === "doubao") {\n\t\tconst { content, citations } = await runDoubaoSearch({\n\t\t\tquery: params.query,\n\t\t\tapiKey: params.apiKey,\n\t\t\tbaseUrl: params.doubaoBaseUrl ?? DEFAULT_DOUBAO_BASE_URL,\n\t\t\tmodel: params.doubaoModel ?? DEFAULT_DOUBAO_MODEL,\n\t\t\ttimeoutSeconds: params.timeoutSeconds\n\t\t});\n\t\tconst payload = {\n\t\t\tquery: params.query,\n\t\t\tprovider: params.provider,\n\t\t\tmodel: params.doubaoModel ?? DEFAULT_DOUBAO_MODEL,\n\t\t\ttookMs: Date.now() - start,\n\t\t\texternalContent: {\n\t\t\t\tuntrusted: true,\n\t\t\t\tsource: "web_search",\n\t\t\t\tprovider: params.provider,\n\t\t\t\twrapped: true\n\t\t\t},\n\t\t\tcontent: wrapWebContent(content),\n\t\t\tcitations\n\t\t};\n\t\twriteCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);\n\t\treturn payload;\n\t}\n\tif (params.provider === "gemini") {`,
    },
    {
      label: 'doubao config in createWebSearchTool',
      before: `\tconst grokConfig = resolveGrokConfig(search);\n\tconst geminiConfig = resolveGeminiConfig(search);\n\tconst kimiConfig = resolveKimiConfig(search);\n\tconst braveMode = resolveBraveMode(resolveBraveConfig(search));`,
      after: `\tconst grokConfig = resolveGrokConfig(search);\n\tconst geminiConfig = resolveGeminiConfig(search);\n\tconst kimiConfig = resolveKimiConfig(search);\n\tconst doubaoConfig = resolveDoubaoConfig(search);\n\tconst braveMode = resolveBraveMode(resolveBraveConfig(search));`,
    },
    {
      label: 'doubao tool description',
      before: `\t\tdescription: provider === "perplexity" ? perplexitySchemaTransportHint === "chat_completions" ? "Search the web using Perplexity Sonar via Perplexity/OpenRouter chat completions. Returns AI-synthesized answers with citations from web-grounded search." : "Search the web using Perplexity. Runtime routing decides between native Search API and Sonar chat-completions compatibility. Structured filters are available on the native Search API path." : provider === "grok" ? "Search the web using xAI Grok. Returns AI-synthesized answers with citations from real-time web search." : provider === "kimi" ? "Search the web using Kimi by Moonshot. Returns AI-synthesized answers with citations from native $web_search." : provider === "gemini" ? "Search the web using Gemini with Google Search grounding. Returns AI-synthesized answers with citations from Google Search." : braveMode === "llm-context" ? "Search the web using Brave Search LLM Context API. Returns pre-extracted page content (text chunks, tables, code blocks) optimized for LLM grounding." : "Search the web using Brave Search API. Supports region-specific and localized search via country and language parameters. Returns titles, URLs, and snippets for fast research.",`,
      after: `\t\tdescription: provider === "perplexity" ? perplexitySchemaTransportHint === "chat_completions" ? "Search the web using Perplexity Sonar via Perplexity/OpenRouter chat completions. Returns AI-synthesized answers with citations from web-grounded search." : "Search the web using Perplexity. Runtime routing decides between native Search API and Sonar chat-completions compatibility. Structured filters are available on the native Search API path." : provider === "grok" ? "Search the web using xAI Grok. Returns AI-synthesized answers with citations from real-time web search." : provider === "doubao" ? "Search the web using Doubao Responses API web_search. Returns AI-synthesized answers with citations from Doubao web-grounded search." : provider === "kimi" ? "Search the web using Kimi by Moonshot. Returns AI-synthesized answers with citations from native $web_search." : provider === "gemini" ? "Search the web using Gemini with Google Search grounding. Returns AI-synthesized answers with citations from Google Search." : braveMode === "llm-context" ? "Search the web using Brave Search LLM Context API. Returns pre-extracted page content (text chunks, tables, code blocks) optimized for LLM grounding." : "Search the web using Brave Search API. Supports region-specific and localized search via country and language parameters. Returns titles, URLs, and snippets for fast research.",`,
    },
    {
      label: 'doubao key resolution',
      before: `\t\t\tconst apiKey = provider === "perplexity" ? perplexityRuntime?.apiKey : provider === "grok" ? resolveGrokApiKey(grokConfig) : provider === "kimi" ? resolveKimiApiKey(kimiConfig) : provider === "gemini" ? resolveGeminiApiKey(geminiConfig) : resolveSearchApiKey(search);`,
      after: `\t\t\tconst apiKey = provider === "perplexity" ? perplexityRuntime?.apiKey : provider === "grok" ? resolveGrokApiKey(grokConfig) : provider === "kimi" ? resolveKimiApiKey(kimiConfig) : provider === "doubao" ? resolveDoubaoApiKey(doubaoConfig) : provider === "gemini" ? resolveGeminiApiKey(geminiConfig) : resolveSearchApiKey(search);`,
    },
    {
      label: 'doubao runWebSearch params',
      before: `\t\t\t\tgrokModel: resolveGrokModel(grokConfig),\n\t\t\t\tgrokInlineCitations: resolveGrokInlineCitations(grokConfig),\n\t\t\t\tgeminiModel: resolveGeminiModel(geminiConfig),\n\t\t\t\tkimiBaseUrl: resolveKimiBaseUrl(kimiConfig),\n\t\t\t\tkimiModel: resolveKimiModel(kimiConfig),\n\t\t\t\tbraveMode`,
      after: `\t\t\t\tgrokModel: resolveGrokModel(grokConfig),\n\t\t\t\tgrokInlineCitations: resolveGrokInlineCitations(grokConfig),\n\t\t\t\tgeminiModel: resolveGeminiModel(geminiConfig),\n\t\t\t\tkimiBaseUrl: resolveKimiBaseUrl(kimiConfig),\n\t\t\t\tkimiModel: resolveKimiModel(kimiConfig),\n\t\t\t\tdoubaoBaseUrl: resolveDoubaoBaseUrl(doubaoConfig),\n\t\t\t\tdoubaoModel: resolveDoubaoModel(doubaoConfig),\n\t\t\t\tbraveMode`,
    },
  ];

  for (const replacement of replacements) {
    const result = replaceRequired(content, filePath, replacement.label, replacement.before, replacement.after);
    content = result.content;
    changed = changed || result.changed;
  }

  return writePatchedFile(filePath, content, changed);
}

function patchOnboardSearchChunk(filePath) {
  const original = readFileSync(filePath, 'utf8');
  if (original.includes('label: "Doubao Search"')) {
    return false;
  }

  let content = original;
  let changed = false;

  const replacements = [
    {
      label: 'doubao onboarding option',
      before: `\t{\n\t\tvalue: "perplexity",\n\t\tlabel: "Perplexity Search",`,
      after: `\t{\n\t\tvalue: "doubao",\n\t\tlabel: "Doubao Search",\n\t\thint: "Doubao Responses API web_search via Jurismind",\n\t\tenvKeys: ["JURISMIND_API_KEY"],\n\t\tplaceholder: "token_key...",\n\t\tsignupUrl: "https://lawclaw-app.jurismind.com"\n\t},\n\t{\n\t\tvalue: "perplexity",\n\t\tlabel: "Perplexity Search",`,
    },
    {
      label: 'doubao onboarding raw key',
      before: `\t\tcase "kimi": return search?.kimi?.apiKey;\n\t\tcase "perplexity": return search?.perplexity?.apiKey;`,
      after: `\t\tcase "kimi": return search?.kimi?.apiKey;\n\t\tcase "doubao": return search?.doubao?.apiKey;\n\t\tcase "perplexity": return search?.perplexity?.apiKey;`,
    },
    {
      label: 'doubao onboarding apply key',
      before: `\t\tcase "kimi":\n\t\t\tsearch.kimi = {\n\t\t\t\t...search.kimi,\n\t\t\t\tapiKey: key\n\t\t\t};\n\t\t\tbreak;\n\t\tcase "perplexity":`,
      after: `\t\tcase "kimi":\n\t\t\tsearch.kimi = {\n\t\t\t\t...search.kimi,\n\t\t\t\tapiKey: key\n\t\t\t};\n\t\t\tbreak;\n\t\tcase "doubao":\n\t\t\tsearch.doubao = {\n\t\t\t\t...search.doubao,\n\t\t\t\tapiKey: key\n\t\t\t};\n\t\t\tbreak;\n\t\tcase "perplexity":`,
    },
  ];

  for (const replacement of replacements) {
    const result = replaceRequired(content, filePath, replacement.label, replacement.before, replacement.after);
    content = result.content;
    changed = changed || result.changed;
  }

  return writePatchedFile(filePath, content, changed);
}

function findDistBasenameByPrefix(distDir, prefix) {
  if (!existsSync(distDir)) {
    return null;
  }

  return (
    readdirSync(distDir).find((name) => name.startsWith(prefix) && name.endsWith('.js'))
    || null
  );
}

function buildJurismindWebSearchPluginManifest() {
  return `${JSON.stringify(
    {
      id: JURISMIND_WEB_SEARCH_PLUGIN_ID,
      providerAuthEnvVars: {
        doubao: ['JURISMIND_API_KEY'],
      },
      uiHints: {
        'webSearch.apiKey': {
          label: 'Jurismind Search API Key',
          help: 'Jurismind API key for Doubao web search.',
          sensitive: true,
          placeholder: 'token_key...',
        },
        'webSearch.baseUrl': {
          label: 'Jurismind Search Base URL',
          help: 'Optional Jurismind Responses API base URL override.',
        },
        'webSearch.model': {
          label: 'Jurismind Search Model',
          help: 'Optional Jurismind Responses API model override.',
        },
      },
      contracts: {
        webSearchProviders: ['doubao'],
      },
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          webSearch: {
            type: 'object',
            additionalProperties: false,
            properties: {
              apiKey: {
                type: ['string', 'object'],
              },
              baseUrl: {
                type: 'string',
              },
              model: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    null,
    2
  )}\n`;
}

function buildJurismindWebSearchPluginSource(modules) {
  return `import { t as definePluginEntry } from "../../${modules.pluginEntry}";
import { d as readNumberParam, h as readStringParam } from "../../${modules.common}";
import { C as resolveSearchCacheTtlMs, T as resolveSearchTimeoutSeconds, a as mergeScopedSearchConfig, b as readCachedSearchPayload, c as setScopedCredentialValue, k as writeCachedSearchPayload, m as buildUnsupportedSearchFilterResponse, n as resolveWebSearchProviderCredential, o as resolveProviderWebSearchPluginConfig, p as buildSearchCacheKey, r as getScopedCredentialValue, s as setProviderWebSearchPluginConfigValue, w as resolveSearchCount, y as postTrustedWebToolsJson } from "../../${modules.providerWebSearch}";
import { c as wrapWebContent } from "../../${modules.externalContent}";
import { s as resolveXaiResponseTextAndCitations } from "../../${modules.toolConfigShared}";
import { Type } from "@sinclair/typebox";
//#region lawclaw/extensions/jurismind/web-search.ts
// ${JURISMIND_WEB_SEARCH_PLUGIN_MARKER}
const JURISMIND_PLUGIN_ID = "jurismind";
const DOUBAO_PROVIDER_ID = "doubao";
const DOUBAO_ENV_VARS = ["JURISMIND_API_KEY"];
const DOUBAO_DEFAULT_BASE_URL = "${DOUBAO_DEFAULT_BASE_URL}";
const DOUBAO_DEFAULT_MODEL = "${DOUBAO_DEFAULT_MODEL}";
const WEB_SEARCH_DOCS_URL = "https://docs.openclaw.ai/tools/web";
function isRecord(value) {
\treturn typeof value === "object" && value !== null && !Array.isArray(value);
}
function resolveLegacyDoubaoConfig(config) {
\tconst search = config?.tools?.web?.search;
\tif (!isRecord(search)) return {};
\tconst doubao = search.doubao;
\treturn isRecord(doubao) ? doubao : {};
}
function resolveDoubaoConfig(searchConfig) {
\tconst doubao = searchConfig?.doubao;
\treturn isRecord(doubao) ? doubao : {};
}
function resolveDoubaoConfiguredCredentialValue(config) {
\treturn resolveProviderWebSearchPluginConfig(config, JURISMIND_PLUGIN_ID)?.apiKey ?? resolveLegacyDoubaoConfig(config).apiKey;
}
function setDoubaoConfiguredCredentialValue(configTarget, value) {
\tsetProviderWebSearchPluginConfigValue(configTarget, JURISMIND_PLUGIN_ID, "apiKey", value);
}
function resolveDoubaoBaseUrl(searchConfig) {
\tconst doubao = resolveDoubaoConfig(searchConfig);
\tconst configured = typeof doubao.baseUrl === "string" ? doubao.baseUrl.trim().replace(/\\/+$/, "") : "";
\treturn configured || DOUBAO_DEFAULT_BASE_URL;
}
function resolveDoubaoModel(searchConfig) {
\tconst doubao = resolveDoubaoConfig(searchConfig);
\treturn (typeof doubao.model === "string" ? doubao.model.trim() : "") || DOUBAO_DEFAULT_MODEL;
}
async function runDoubaoSearch(params) {
\tconst endpoint = \`\${params.baseUrl.replace(/\\/+$/, "")}/responses\`;
\treturn await postTrustedWebToolsJson({
\t\turl: endpoint,
\t\ttimeoutSeconds: params.timeoutSeconds,
\t\tapiKey: params.apiKey,
\t\tbody: {
\t\t\tmodel: params.model,
\t\t\ttools: [{ type: "web_search" }],
\t\t\tinput: params.query
\t\t},
\t\terrorLabel: "Doubao"
\t}, async (response) => {
\t\tconst data = await response.json();
\t\treturn resolveXaiResponseTextAndCitations(data);
\t});
}
function createDoubaoSchema() {
\treturn Type.Object({
\t\tquery: Type.String({ description: "Search query string." }),
\t\tcount: Type.Optional(Type.Number({
\t\t\tdescription: "Number of results to return (1-10).",
\t\t\tminimum: 1,
\t\t\tmaximum: 10
\t\t})),
\t\tcountry: Type.Optional(Type.String({ description: "Not supported by Doubao." })),
\t\tlanguage: Type.Optional(Type.String({ description: "Not supported by Doubao." })),
\t\tfreshness: Type.Optional(Type.String({ description: "Not supported by Doubao." })),
\t\tdate_after: Type.Optional(Type.String({ description: "Not supported by Doubao." })),
\t\tdate_before: Type.Optional(Type.String({ description: "Not supported by Doubao." }))
\t});
}
function createDoubaoToolDefinition(searchConfig) {
\treturn {
\t\tdescription: "Search the web using Doubao Responses API web_search. Returns AI-synthesized answers with citations from Doubao web-grounded search.",
\t\tparameters: createDoubaoSchema(),
\t\texecute: async (args) => {
\t\t\tconst params = args;
\t\t\tconst unsupportedResponse = buildUnsupportedSearchFilterResponse(params, "doubao");
\t\t\tif (unsupportedResponse) return unsupportedResponse;
\t\t\tconst apiKey = resolveWebSearchProviderCredential({
\t\t\t\tcredentialValue: getScopedCredentialValue(searchConfig, DOUBAO_PROVIDER_ID),
\t\t\t\tenvVars: DOUBAO_ENV_VARS
\t\t\t});
\t\t\tif (!apiKey) return {
\t\t\t\terror: "missing_doubao_api_key",
\t\t\t\tmessage: "web_search (doubao) needs a Jurismind API key. Set JURISMIND_API_KEY in the Gateway environment, or configure plugins.entries.jurismind.config.webSearch.apiKey.",
\t\t\t\tdocs: WEB_SEARCH_DOCS_URL
\t\t\t};
\t\t\tconst query = readStringParam(params, "query", { required: true });
\t\t\tconst count = readNumberParam(params, "count", { integer: true }) ?? searchConfig?.maxResults ?? void 0;
\t\t\tconst baseUrl = resolveDoubaoBaseUrl(searchConfig);
\t\t\tconst model = resolveDoubaoModel(searchConfig);
\t\t\tconst cacheKey = buildSearchCacheKey([
\t\t\t\tDOUBAO_PROVIDER_ID,
\t\t\t\tquery,
\t\t\t\tresolveSearchCount(count, 5),
\t\t\t\tbaseUrl,
\t\t\t\tmodel
\t\t\t]);
\t\t\tconst cached = readCachedSearchPayload(cacheKey);
\t\t\tif (cached) return cached;
\t\t\tconst start = Date.now();
\t\t\tconst result = await runDoubaoSearch({
\t\t\t\tquery,
\t\t\t\tapiKey,
\t\t\t\tbaseUrl,
\t\t\t\tmodel,
\t\t\t\ttimeoutSeconds: resolveSearchTimeoutSeconds(searchConfig)
\t\t\t});
\t\t\tconst payload = {
\t\t\t\tquery,
\t\t\t\tprovider: DOUBAO_PROVIDER_ID,
\t\t\t\tmodel,
\t\t\t\ttookMs: Date.now() - start,
\t\t\t\texternalContent: {
\t\t\t\t\tuntrusted: true,
\t\t\t\t\tsource: "web_search",
\t\t\t\t\tprovider: DOUBAO_PROVIDER_ID,
\t\t\t\t\twrapped: true
\t\t\t\t},
\t\t\t\tcontent: wrapWebContent(result.content, "web_search"),
\t\t\t\tcitations: result.citations
\t\t\t};
\t\t\twriteCachedSearchPayload(cacheKey, payload, resolveSearchCacheTtlMs(searchConfig));
\t\t\treturn payload;
\t\t}
\t};
}
function createJurismindWebSearchProvider() {
\treturn {
\t\tid: DOUBAO_PROVIDER_ID,
\t\tlabel: "Doubao Search",
\t\thint: "Jurismind Responses API web_search",
\t\tonboardingScopes: ["text-inference"],
\t\tcredentialLabel: "Jurismind API key",
\t\tenvVars: DOUBAO_ENV_VARS,
\t\tplaceholder: "token_key...",
\t\tsignupUrl: "https://lawclaw-app.jurismind.com",
\t\tdocsUrl: WEB_SEARCH_DOCS_URL,
\t\tautoDetectOrder: 45,
\t\tcredentialPath: "plugins.entries.jurismind.config.webSearch.apiKey",
\t\tinactiveSecretPaths: [
\t\t\t"plugins.entries.jurismind.config.webSearch.apiKey",
\t\t\t"tools.web.search.doubao.apiKey"
\t\t],
\t\tgetCredentialValue: (searchConfig) => getScopedCredentialValue(searchConfig, DOUBAO_PROVIDER_ID),
\t\tsetCredentialValue: (searchConfigTarget, value) => setScopedCredentialValue(searchConfigTarget, DOUBAO_PROVIDER_ID, value),
\t\tgetConfiguredCredentialValue: resolveDoubaoConfiguredCredentialValue,
\t\tsetConfiguredCredentialValue: setDoubaoConfiguredCredentialValue,
\t\tcreateTool: (ctx) => createDoubaoToolDefinition(
\t\t\tmergeScopedSearchConfig(
\t\t\t\tctx.searchConfig,
\t\t\t\tDOUBAO_PROVIDER_ID,
\t\t\t\tresolveProviderWebSearchPluginConfig(ctx.config, JURISMIND_PLUGIN_ID)
\t\t\t)
\t\t)
\t};
}
var jurismind_default = definePluginEntry({
\tid: JURISMIND_PLUGIN_ID,
\tname: "Jurismind Web Search Plugin",
\tdescription: "Bundled Jurismind Doubao web_search plugin",
\tregister(api) {
\t\tapi.registerWebSearchProvider(createJurismindWebSearchProvider());
\t}
});
//#endregion
export { jurismind_default as default };
`;
}

function patchModernJurismindWebSearchRuntime(openClawDir) {
  const distDir = join(openClawDir, 'dist');
  if (!existsSync(distDir)) {
    return null;
  }

  const modules = {
    pluginEntry: findDistBasenameByPrefix(distDir, 'plugin-entry-'),
    common: findDistBasenameByPrefix(distDir, 'common-'),
    providerWebSearch: findDistBasenameByPrefix(distDir, 'provider-web-search-'),
    externalContent: findDistBasenameByPrefix(distDir, 'external-content-'),
    toolConfigShared: findDistBasenameByPrefix(distDir, 'tool-config-shared-'),
  };

  if (Object.values(modules).some((value) => !value)) {
    return null;
  }

  const extensionDir = join(distDir, 'extensions', JURISMIND_WEB_SEARCH_PLUGIN_ID);
  mkdirSync(extensionDir, { recursive: true });

  const indexPath = join(extensionDir, 'index.js');
  const manifestPath = join(extensionDir, 'openclaw.plugin.json');

  const nextIndexSource = buildJurismindWebSearchPluginSource(modules);
  const nextManifestSource = buildJurismindWebSearchPluginManifest();

  const patchedFiles = [];

  const currentIndexSource = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  if (currentIndexSource !== nextIndexSource) {
    writeFileSync(indexPath, nextIndexSource, 'utf8');
    patchedFiles.push(`extensions/${JURISMIND_WEB_SEARCH_PLUGIN_ID}/index.js`);
  }

  const currentManifestSource = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  if (currentManifestSource !== nextManifestSource) {
    writeFileSync(manifestPath, nextManifestSource, 'utf8');
    patchedFiles.push(`extensions/${JURISMIND_WEB_SEARCH_PLUGIN_ID}/openclaw.plugin.json`);
  }

  return patchedFiles;
}

function patchOpenClawWebSearchRuntimeLegacy(openClawDir) {
  const distDir = join(openClawDir, 'dist');
  if (!existsSync(distDir)) {
    return [];
  }

  const patchedFiles = [];
  const runtimeRootChunkPatterns = [
    /^auth-profiles-.*\.js$/,
    /^model-selection-.*\.js$/,
    /^reply-.*\.js$/,
  ];
  const onboardingPatterns = [
    /^onboard-search-.*\.js$/,
  ];

  walkFiles(distDir, (filePath) => {
    const relativeName = filePath.slice(distDir.length + 1).replace(/\\/g, '/');
    const basename = relativeName.split('/').pop() || '';
    const isRuntimeChunk =
      (!relativeName.includes('/') && runtimeRootChunkPatterns.some((pattern) => pattern.test(basename)))
      || (relativeName.startsWith('plugin-sdk/') && /^thread-bindings-.*\.js$/.test(basename));
    const isOnboardingChunk = onboardingPatterns.some((pattern) => pattern.test(basename));

    let patched = false;
    if (isRuntimeChunk) {
      patched = patchRuntimeWebSearchChunk(filePath);
    } else if (isOnboardingChunk) {
      patched = patchOnboardSearchChunk(filePath);
    }

    if (patched) {
      patchedFiles.push(relativeName);
    }
  });

  return patchedFiles;
}

function buildPatchedWindowsSpawnSource() {
  return String.raw`import { readFileSync, statSync } from "node:fs";
import path from "node:path";
//#region src/plugin-sdk/windows-spawn.ts
// ${WINDOWS_SPAWN_PATCH_MARKER}
const WRAPPER_TEXT_ENCODINGS = ["utf8", "utf-16le", "gbk"];
const DIRECT_EXECUTABLE_EXTENSIONS = new Set([".exe", ".com"]);
const SCRIPT_ENTRY_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
function isFilePath(candidate) {
	try {
		return statSync(candidate).isFile();
	} catch {
		return false;
	}
}
function uniquePreserveOrder(values) {
	const seen = new Set();
	const result = [];
	for (const value of values) {
		if (!value || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}
function prioritizeWindowsPathExt(exts) {
	const normalized = uniquePreserveOrder(exts.map((ext) => ext.toLowerCase()));
	const prioritized = [];
	for (const ext of [".exe", ".com", ".cmd", ".bat"]) {
		if (normalized.includes(ext)) prioritized.push(ext);
	}
	for (const ext of normalized) {
		if (!prioritized.includes(ext)) prioritized.push(ext);
	}
	return prioritized;
}
function resolveWindowsExecutablePath(command, env) {
	if (command.includes("/") || command.includes("\\") || path.isAbsolute(command)) return command;
	const pathEntries = (env.PATH ?? env.Path ?? process.env.PATH ?? process.env.Path ?? "").split(";").map((entry) => entry.trim()).filter(Boolean);
	const hasExtension = path.extname(command).length > 0;
	const pathExtRaw = env.PATHEXT ?? env.Pathext ?? process.env.PATHEXT ?? process.env.Pathext ?? ".EXE;.CMD;.BAT;.COM";
	const rawExts = hasExtension ? [""] : pathExtRaw.split(";").map((ext) => ext.trim()).filter(Boolean).map((ext) => ext.startsWith(".") ? ext : "." + ext);
	const pathExt = hasExtension ? [""] : prioritizeWindowsPathExt(rawExts);
	for (const dir of pathEntries) for (const ext of pathExt) for (const candidateExt of uniquePreserveOrder([
		ext,
		ext.toLowerCase(),
		ext.toUpperCase()
	])) {
		const candidate = path.join(dir, command + candidateExt);
		if (isFilePath(candidate)) return candidate;
	}
	return command;
}
function decodeWrapperBuffer(raw, encoding) {
	const decoded = new TextDecoder(encoding, { fatal: false }).decode(raw);
	return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}
function readWindowsCmdShimContents(raw) {
	const contents = [];
	const seen = new Set();
	const tryPush = (encoding) => {
		try {
			const decoded = decodeWrapperBuffer(raw, encoding);
			if (!decoded.trim() || seen.has(decoded)) return;
			seen.add(decoded);
			contents.push(decoded);
		} catch {}
	};
	if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) tryPush("utf8");
	if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) tryPush("utf-16le");
	if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) tryPush("utf-16be");
	for (const encoding of WRAPPER_TEXT_ENCODINGS) tryPush(encoding);
	return contents;
}
function resolveDp0Candidate(wrapperPath, token) {
	const relative = token.match(/%~?dp0%?\s*[\\/]*(.*)$/i)?.[1]?.trim();
	if (!relative) return null;
	const normalizedRelative = relative.replace(/[\\/]+/g, path.sep).replace(/^[\\/]+/, "");
	return path.resolve(path.dirname(wrapperPath), normalizedRelative);
}
function collectShimCandidates(wrapperPath, content) {
	const candidates = [];
	for (const match of content.matchAll(/"([^"\r\n]*)"/g)) {
		const token = match[1] ?? "";
		const candidate = resolveDp0Candidate(wrapperPath, token);
		if (candidate && isFilePath(candidate)) candidates.push(candidate);
	}
	return uniquePreserveOrder(candidates);
}
function detectPowerShellCommand(content) {
	if (/\bpwsh(?:\.exe)?\b/i.test(content)) return "pwsh.exe";
	if (/\bpowershell(?:\.exe)?\b/i.test(content)) return "powershell.exe";
	return null;
}
function isNodeLauncher(candidate) {
	const base = path.basename(candidate).toLowerCase();
	return base === "node.exe" || base === "node";
}
function resolveEntrypointFromCmdShim(wrapperPath, env, execPath) {
	if (!isFilePath(wrapperPath)) return null;
	try {
		const raw = readFileSync(wrapperPath);
		for (const content of readWindowsCmdShimContents(raw)) {
			const shimCandidates = collectShimCandidates(wrapperPath, content);
			const powerShellCommand = detectPowerShellCommand(content);
			if (powerShellCommand && /(?:^|\s)-File(?:\s|$)/i.test(content)) {
				const scriptPath = shimCandidates.find((candidate) => path.extname(candidate).toLowerCase() === ".ps1");
				if (scriptPath) return {
					command: resolveWindowsExecutablePath(powerShellCommand, env),
					leadingArgv: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
					resolution: "exe-entrypoint",
					windowsHide: true
				};
			}
			const scriptEntry = shimCandidates.find((candidate) => SCRIPT_ENTRY_EXTENSIONS.has(path.extname(candidate).toLowerCase()));
			if (scriptEntry) return {
				command: execPath,
				leadingArgv: [scriptEntry],
				resolution: "node-entrypoint",
				windowsHide: true
			};
			const exeEntry = shimCandidates.find((candidate) => DIRECT_EXECUTABLE_EXTENSIONS.has(path.extname(candidate).toLowerCase()) && !isNodeLauncher(candidate));
			if (exeEntry) return {
				command: exeEntry,
				leadingArgv: [],
				resolution: "exe-entrypoint",
				windowsHide: true
			};
		}
	} catch {}
	return null;
}
function resolveBinEntry(packageName, binField) {
	if (typeof binField === "string") return binField.trim() || null;
	if (!binField || typeof binField !== "object") return null;
	if (packageName) {
		const preferred = binField[packageName];
		if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
	}
	for (const value of Object.values(binField)) if (typeof value === "string" && value.trim()) return value.trim();
	return null;
}
function resolveEntrypointFromPackageJson(wrapperPath, packageName) {
	if (!packageName) return null;
	const wrapperDir = path.dirname(wrapperPath);
	const packageDirs = [path.resolve(wrapperDir, "..", packageName), path.resolve(wrapperDir, "node_modules", packageName)];
	for (const packageDir of packageDirs) {
		const packageJsonPath = path.join(packageDir, "package.json");
		if (!isFilePath(packageJsonPath)) continue;
		try {
			const entryRel = resolveBinEntry(packageName, JSON.parse(readFileSync(packageJsonPath, "utf8")).bin);
			if (!entryRel) continue;
			const entryPath = path.resolve(packageDir, entryRel);
			if (isFilePath(entryPath)) return entryPath;
		} catch {}
	}
	return null;
}
function materializeResolvedEntrypoint(entrypoint, execPath) {
	if (DIRECT_EXECUTABLE_EXTENSIONS.has(path.extname(entrypoint).toLowerCase())) return {
		command: entrypoint,
		leadingArgv: [],
		resolution: "exe-entrypoint",
		windowsHide: true
	};
	return {
		command: execPath,
		leadingArgv: [entrypoint],
		resolution: "node-entrypoint",
		windowsHide: true
	};
}
function resolveWindowsSpawnProgramCandidate(params) {
	const platform = params.platform ?? process.platform;
	const env = params.env ?? process.env;
	const execPath = params.execPath ?? process.execPath;
	if (platform !== "win32") return {
		command: params.command,
		leadingArgv: [],
		resolution: "direct"
	};
	const resolvedCommand = resolveWindowsExecutablePath(params.command, env);
	const ext = path.extname(resolvedCommand).toLowerCase();
	if (SCRIPT_ENTRY_EXTENSIONS.has(ext)) return {
		command: execPath,
		leadingArgv: [resolvedCommand],
		resolution: "node-entrypoint",
		windowsHide: true
	};
	if (ext === ".cmd" || ext === ".bat") {
		const shimProgram = resolveEntrypointFromCmdShim(resolvedCommand, env, execPath);
		if (shimProgram) return shimProgram;
		const entrypoint = resolveEntrypointFromPackageJson(resolvedCommand, params.packageName);
		if (entrypoint) return materializeResolvedEntrypoint(entrypoint, execPath);
		return {
			command: resolvedCommand,
			leadingArgv: [],
			resolution: "unresolved-wrapper"
		};
	}
	return {
		command: resolvedCommand,
		leadingArgv: [],
		resolution: "direct"
	};
}
function applyWindowsSpawnProgramPolicy(params) {
	if (params.candidate.resolution !== "unresolved-wrapper") return {
		command: params.candidate.command,
		leadingArgv: params.candidate.leadingArgv,
		resolution: params.candidate.resolution,
		windowsHide: params.candidate.windowsHide
	};
	if (params.allowShellFallback !== false) return {
		command: params.candidate.command,
		leadingArgv: [],
		resolution: "shell-fallback",
		shell: true
	};
	throw new Error(path.basename(params.candidate.command) + " wrapper resolved, but no executable/Node entrypoint could be resolved without shell execution.");
}
function resolveWindowsSpawnProgram(params) {
	return applyWindowsSpawnProgramPolicy({
		candidate: resolveWindowsSpawnProgramCandidate(params),
		allowShellFallback: params.allowShellFallback
	});
}
function materializeWindowsSpawnProgram(program, argv) {
	return {
		command: program.command,
		argv: [...program.leadingArgv, ...argv],
		resolution: program.resolution,
		shell: program.shell,
		windowsHide: program.windowsHide
	};
}
//#endregion
export { resolveWindowsSpawnProgramCandidate as a, resolveWindowsSpawnProgram as i, materializeWindowsSpawnProgram as n, resolveWindowsExecutablePath as r, applyWindowsSpawnProgramPolicy as t };
`;
}

function patchOpenClawWindowsSpawnFile(filePath) {
  const original = readFileSync(filePath, 'utf8');
  if (original.includes(WINDOWS_SPAWN_PATCH_MARKER)) {
    return false;
  }

  writeFileSync(filePath, buildPatchedWindowsSpawnSource(), 'utf8');
  return true;
}

function patchOpenClawWindowsSpawnRuntime(openClawDir) {
  const pluginSdkDir = join(openClawDir, 'dist', 'plugin-sdk');
  if (!existsSync(pluginSdkDir)) {
    return [];
  }

  const patchedFiles = [];
  walkFiles(pluginSdkDir, (filePath) => {
    const basename = filePath.slice(pluginSdkDir.length + 1).replace(/\\/g, '/');
    if (!/^windows-spawn(?:-.*)?\.js$/.test(basename)) {
      return;
    }

    if (patchOpenClawWindowsSpawnFile(filePath)) {
      patchedFiles.push(`plugin-sdk/${basename}`);
    }
  });

  return patchedFiles;
}

function walkFiles(dir, visitor) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, visitor);
      continue;
    }

    if (entry.isFile()) {
      visitor(fullPath);
    }
  }
}

function patchOpenClawWebSearchRuntime(openClawDir) {
  const patchedModernRuntime = patchModernJurismindWebSearchRuntime(openClawDir);
  if (patchedModernRuntime) {
    return patchedModernRuntime;
  }

  return patchOpenClawWebSearchRuntimeLegacy(openClawDir);
}

function patchOpenClawBundleCompat(nodeModulesDir) {
  const patchedPackages = [];

  // OpenClaw loads TypeScript extensions through jiti, which reaches this
  // dependency via require(). Node 22 can bridge into the ESM entrypoint, but
  // only if the package exports map explicitly allows require/default.
  if (patchRequireCompatiblePackage(nodeModulesDir, 'https-proxy-agent')) {
    patchedPackages.push('https-proxy-agent');
  }

  return patchedPackages;
}

module.exports = {
  patchRequireCompatiblePackage,
  patchOpenClawExtensionRuntimeDeps,
  patchOpenClawWebSearchRuntime,
  patchOpenClawWindowsSpawnRuntime,
  patchOpenClawBundleCompat,
};
