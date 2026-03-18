#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const forwardedArgs = process.argv.slice(2);
const shouldUseUnsignedMacConfig =
  process.platform === 'darwin' && process.env.LAWCLAW_MAC_SIGN !== '1';

const electronBuilderBin =
  process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'electron-builder.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'electron-builder');

const args = shouldUseUnsignedMacConfig
  ? ['--config', 'electron-builder.nosign.yml', ...forwardedArgs]
  : forwardedArgs;

const result = spawnSync(electronBuilderBin, args, {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
