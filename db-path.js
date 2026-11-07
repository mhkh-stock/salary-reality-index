// Writable-location fallback for the SQLite DB (same pattern as FoodScope):
// use the app directory when it is writable; when it is not (e.g. SnapDeploy's
// read-only /app), fall back to /tmp/<app>. DB_FILE env always wins when set.
// `isWritable` is injectable so tests can simulate a read-only app dir
// deterministically (as root, chmod alone does not make accessSync fail).
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultIsWritable(dir) {
  try { fs.accessSync(dir, fs.constants.W_OK); return true; }
  catch { return false; }
}

function resolveDbFile({ appDir, fileName, tmpName, isWritable = defaultIsWritable }) {
  if (process.env.DB_FILE) return process.env.DB_FILE;
  if (isWritable(appDir)) return path.join(appDir, 'data', fileName);
  const fallback = path.join(os.tmpdir(), tmpName, fileName);
  console.log('Data directory (read-only app dir fallback):', path.dirname(fallback));
  return fallback;
}

module.exports = { resolveDbFile };
