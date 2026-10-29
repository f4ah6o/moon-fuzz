import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../poc/runner.mjs';

const require = createRequire(import.meta.url);
const { createCoverage } = require('../poc/coverage.cjs');
const targetId = 'research/target$file';
const packageName = 'research/target';

function instrumented({ init = 0, driver = 0, lateInit = false } = {}) {
  const target = [init, 0, 0, 0];
  const driverCounts = [driver, 0];
  const other = [1];
  let first = true;
  return {
    fuzz_one(input) {
      driverCounts[1] += driver + 1;
      other[0]++;
      if (first && lateInit) target[3]++;
      first = false;
      target[input[0] === 65 ? 1 : 2]++;
      return 0;
    },
    coverage_end() {
      console.log('----- BEGIN MOONBIT COVERAGE -----');
      console.log(JSON.stringify({ [targetId]: target, 'research/driver$file': driverCounts, 'research/target-extra$file': other }));
      console.log('----- END MOONBIT COVERAGE -----');
      target.fill(0); driverCounts.fill(0); other.fill(0);
    },
  };
}

function sample(target, collector, input) {
  target.fuzz_one(Buffer.from(input));
  return collector.collect().features;
}

test('same collector resets A/B/A and excludes initialization and other packages', () => {
  const results = [];
  for (const options of [{ init: 1, driver: 1 }, { init: 9, driver: 13 }]) {
    const target = instrumented(options);
    const collector = createCoverage(target, packageName, 'fixture');
    const a = sample(target, collector, 'A');
    const b = sample(target, collector, 'B');
    const again = sample(target, collector, 'A');
    assert.deepEqual(a, [{ counter_id: targetId, index: 1 }]);
    assert.deepEqual(b, [{ counter_id: targetId, index: 2 }]);
    assert.deepEqual(again, a);
    assert.deepEqual(collector.collect().features, []);
    results.push({ a, b });
  }
  assert.deepEqual(results[0], results[1]);
});

test('work deferred until the first input remains attributed to that input', () => {
  const target = instrumented({ lateInit: true });
  const collector = createCoverage(target, packageName, 'fixture');
  const first = sample(target, collector, 'A');
  sample(target, collector, 'B');
  const again = sample(target, collector, 'A');
  assert.deepEqual(first, [{ counter_id: targetId, index: 1 }, { counter_id: targetId, index: 3 }]);
  assert.deepEqual(again, [{ counter_id: targetId, index: 1 }]);
});

test('entry hash cannot detect changed required dependency across fresh workers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-dependency-'));
  try {
    const entry = path.join(dir, 'entry.cjs');
    const dep = path.join(dir, 'dep.cjs');
    await writeFile(entry, "module.exports = require('./dep.cjs');\n");
    const source = index => `let counts = [0, 0];
exports.fuzz_one = () => { counts[${index}]++; return 0; };
exports.coverage_end = () => { console.log('----- BEGIN MOONBIT COVERAGE -----'); console.log(JSON.stringify({ 'research/target$file': counts })); console.log('----- END MOONBIT COVERAGE -----'); counts = [0, 0]; };\n`;
    const run = () => execute({ modulePath: entry, input: Buffer.from('A'), guidance: 'coverage', coveragePackage: packageName });
    await writeFile(dep, source(0));
    const a = await run();
    const again = await run();
    await writeFile(dep, source(1));
    const changed = await run();
    assert.equal(a.kind, 'Pass');
    assert.equal(changed.kind, 'Pass');
    assert.deepEqual(a.coverage, again.coverage);
    assert.equal(a.coverage.build_sha256, changed.coverage.build_sha256);
    assert.notDeepEqual(a.coverage.features, changed.coverage.features);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
