'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const BEGIN = '----- BEGIN MOONBIT COVERAGE -----';
const END = '----- END MOONBIT COVERAGE -----';
const MAX_DUMP = 8 * 1024 * 1024;

// The pinned JS runtime implements println with console.log. Capture only
// during the synchronous dump, leaving target stdout as diagnostic output.
function readDump(target) {
  const lines = [];
  let size = 0;
  const original = console.log;
  try {
    console.log = (...args) => {
      const line = args.map(String).join(' ');
      size += Buffer.byteLength(line) + 1;
      if (size > MAX_DUMP) throw new Error('coverage dump exceeds size limit');
      lines.push(line);
    };
    target.coverage_end();
  } finally {
    console.log = original;
  }
  if (lines.shift() !== BEGIN || lines.pop() !== END) throw new Error('invalid coverage dump delimiters');
  let data;
  try { data = JSON.parse(lines.join('\n')); } catch { throw new Error('invalid coverage dump JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid coverage counters');
  for (const [id, counts] of Object.entries(data)) {
    if (!id.includes('$') || !Array.isArray(counts) || !counts.every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)) {
      throw new Error('invalid coverage counter');
    }
  }
  return data;
}

function sameLayout(a, b) {
  const keys = Object.keys(a).sort();
  const other = Object.keys(b).sort();
  return keys.length === other.length && keys.every((key, i) => key === other[i] && a[key].length === b[key].length);
}

function isReset(dump) {
  return Object.values(dump).every(counts => counts.every(count => count === 0));
}

function artifactHash(modulePath) {
  return createHash('sha256').update(readFileSync(modulePath)).digest('hex');
}

function createCoverage(target, packageName, buildId) {
  if (typeof target.coverage_end !== 'function') throw new Error('coverage_end export is required for coverage guidance');
  const baseline = readDump(target); // Discard initialization.
  const ids = Object.keys(baseline).filter(id => id.slice(0, id.indexOf('$')) === packageName).sort();
  if (ids.length === 0 || ids.every(id => baseline[id].length === 0)) throw new Error(`no coverage counters for package ${packageName}`);
  const reset = readDump(target);
  if (!sameLayout(baseline, reset) || !isReset(reset)) throw new Error('coverage counters did not reset');
  return {
    collect() {
      const current = readDump(target);
      if (!sameLayout(baseline, current)) throw new Error('coverage counter layout changed');
      const next = readDump(target);
      if (!sameLayout(baseline, next) || !isReset(next)) throw new Error('coverage counters did not reset');
      const features = [];
      for (const id of ids) {
        current[id].forEach((count, index) => { if (count !== 0) features.push({ counter_id: id, index }); });
      }
      return { provider: 'moon-probe-dump', backend: 'js', build_sha256: buildId, package: packageName, features };
    },
  };
}

module.exports = { artifactHash, createCoverage };
