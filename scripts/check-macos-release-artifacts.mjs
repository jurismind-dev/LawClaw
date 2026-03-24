#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function run(command, args) {
  console.log(`[macos-artifact-check] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
  });
}

function findDmgArtifacts(rootDir) {
  const dmgPaths = [];
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current.dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 3) {
          stack.push({ dir: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.dmg')) {
        dmgPaths.push(fullPath);
      }
    }
  }

  return dmgPaths.sort();
}

const rootDir = resolve(process.argv[2] || 'release');
if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`[macos-artifact-check] Release directory not found: ${rootDir}`);
  process.exit(1);
}

const dmgPaths = findDmgArtifacts(rootDir);
if (dmgPaths.length === 0) {
  console.error(`[macos-artifact-check] No .dmg artifacts found under ${rootDir}`);
  process.exit(1);
}

for (const dmgPath of dmgPaths) {
  run('codesign', ['--verify', '--verbose=2', dmgPath]);
  run('spctl', ['-a', '-vv', '-t', 'open', '--context', 'context:primary-signature', dmgPath]);
  run('xcrun', ['stapler', 'validate', dmgPath]);
}

console.log(
  `[macos-artifact-check] OK: validated ${dmgPaths.length} dmg artifact${dmgPaths.length === 1 ? '' : 's'}.`
);
