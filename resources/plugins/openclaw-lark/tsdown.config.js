"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsdown_1 = require("tsdown");
exports.default = (0, tsdown_1.defineConfig)({
    entry: { index: 'index.ts' },
    format: 'esm',
    target: 'node22',
    platform: 'node',
    clean: true,
    outDir: 'dist',
    dts: true,
    deps: {
        neverBundle: [
            /^openclaw(\/.*)?$/,
            /^@larksuiteoapi\//,
            /^@sinclair\//,
            'image-size',
            'zod',
            /^node:/,
        ],
    },
});
