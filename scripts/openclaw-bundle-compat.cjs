const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

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
  patchOpenClawBundleCompat,
};
