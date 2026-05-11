'use strict';
(function () {
  if (process.platform !== 'win32') return;
  if (process.env.LAWCLAW_DISABLE_WINDOWS_HIDE_PRELOAD === '1') return;
  if (globalThis.__lawclawChildProcessWindowsHidePatched) return;
  globalThis.__lawclawChildProcessWindowsHidePatched = true;

  var childProcess;
  try {
    childProcess = require('node:child_process');
  } catch (_) {
    try {
      childProcess = require('child_process');
    } catch (_) {
      return;
    }
  }

  function withWindowsHide(options) {
    if (options == null) return { windowsHide: true };
    if (typeof options !== 'object' || Array.isArray(options)) return options;
    if (Object.prototype.hasOwnProperty.call(options, 'windowsHide')) return options;
    return Object.assign({}, options, { windowsHide: true });
  }

  function patch(name, wrapper) {
    var original = childProcess[name];
    if (typeof original !== 'function' || original.__lawclawWindowsHidePatched) return;
    var patched = wrapper(original);
    try {
      Object.defineProperty(patched, '__lawclawWindowsHidePatched', { value: true });
      childProcess[name] = patched;
    } catch (_) {}
  }

  function wrapSpawnLike(original) {
    return function lawclawSpawnWithWindowsHide(command, args, options) {
      if (Array.isArray(args)) {
        return original.call(this, command, args, withWindowsHide(options));
      }
      return original.call(this, command, withWindowsHide(args));
    };
  }

  function wrapExec(original) {
    return function lawclawExecWithWindowsHide(command, options, callback) {
      if (typeof options === 'function') {
        return original.call(this, command, withWindowsHide(undefined), options);
      }
      return original.call(this, command, withWindowsHide(options), callback);
    };
  }

  function wrapExecFile(original) {
    return function lawclawExecFileWithWindowsHide(file, args, options, callback) {
      if (typeof args === 'function') {
        return original.call(this, file, withWindowsHide(undefined), args);
      }
      if (Array.isArray(args)) {
        if (typeof options === 'function') {
          return original.call(this, file, args, withWindowsHide(undefined), options);
        }
        return original.call(this, file, args, withWindowsHide(options), callback);
      }
      if (typeof options === 'function') {
        return original.call(this, file, withWindowsHide(args), options);
      }
      return original.call(this, file, withWindowsHide(args), options);
    };
  }

  function wrapExecFileSync(original) {
    return function lawclawExecFileSyncWithWindowsHide(file, args, options) {
      if (Array.isArray(args)) {
        return original.call(this, file, args, withWindowsHide(options));
      }
      return original.call(this, file, withWindowsHide(args));
    };
  }

  function patchNodePtyModule(moduleExports) {
    if (!moduleExports || typeof moduleExports !== 'object') return moduleExports;
    var originalSpawn = moduleExports.spawn;
    if (typeof originalSpawn !== 'function' || originalSpawn.__lawclawWindowsHidePatched) return moduleExports;
    var patchedSpawn = function lawclawPtySpawnWithHide(file, args, options) {
      var nextOptions = options;
      if (nextOptions && typeof nextOptions === 'object' && !Array.isArray(nextOptions) && !Object.prototype.hasOwnProperty.call(nextOptions, 'hide')) {
        nextOptions = Object.assign({}, nextOptions, { hide: true });
      } else if (nextOptions == null) {
        nextOptions = { hide: true };
      }
      return originalSpawn.call(this, file, args, nextOptions);
    };
    try {
      Object.defineProperty(patchedSpawn, '__lawclawWindowsHidePatched', { value: true });
      moduleExports.spawn = patchedSpawn;
    } catch (_) {}
    if (moduleExports.default && moduleExports.default !== moduleExports) patchNodePtyModule(moduleExports.default);
    return moduleExports;
  }

  function patchNodePtyLoader() {
    var Module;
    try {
      Module = require('node:module');
    } catch (_) {
      return;
    }
    if (!Module || !Module._load || Module._load.__lawclawNodePtyHidePatched) return;
    var originalLoad = Module._load;
    Module._load = function lawclawLoadWithPtyHide(request, parent, isMain) {
      var result = originalLoad.apply(this, arguments);
      if (request === '@lydell/node-pty' || /^@lydell\/node-pty-win32-/.test(String(request))) {
        return patchNodePtyModule(result);
      }
      return result;
    };
    try {
      Object.defineProperty(Module._load, '__lawclawNodePtyHidePatched', { value: true });
    } catch (_) {}
  }

  patch('spawn', wrapSpawnLike);
  patch('spawnSync', wrapSpawnLike);
  patch('fork', wrapSpawnLike);
  patch('exec', wrapExec);
  patch('execSync', function (original) {
    return function lawclawExecSyncWithWindowsHide(command, options) {
      return original.call(this, command, withWindowsHide(options));
    };
  });
  patch('execFile', wrapExecFile);
  patch('execFileSync', wrapExecFileSync);
  patchNodePtyLoader();

  try {
    require('node:module').syncBuiltinESMExports();
  } catch (_) {}
})();
