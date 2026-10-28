import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../poc/runner.mjs';

const project = fileURLToPath(new URL('../examples/moonbit/', import.meta.url));
const cli = fileURLToPath(new URL('../poc/cli.mjs', import.meta.url));
const require = createRequire(import.meta.url);
let temp, target, instrumented;
let expectedA, initializationOnly;

before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-moonbit-'));
  for (const [name, flags] of [['plain', []], ['coverage', ['--enable-coverage']]]) {
    const output = path.join(temp, name);
    const build = spawnSync('moon', ['build', '--target', 'js', '--target-dir', output, ...flags], {
      cwd: project, encoding: 'utf8',
    });
    assert.equal(build.status, 0, `moon build failed: ${build.error || build.stderr || build.stdout}`);
  }
  target = path.join(temp, 'plain/js/debug/build/driver/driver.js');
  instrumented = path.join(temp, 'coverage/js/debug/build/driver/driver.js');
});

after(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

test('compiled MoonBit target receives binary bytes and replays a finding', async () => {
  assert.equal((await execute({ modulePath: target, input: Buffer.alloc(0) })).kind, 'Pass');
  assert.equal((await execute({ modulePath: target, input: Buffer.from([0, 255, 128, 42]) })).kind, 'Reject');
  assert.equal((await execute({ modulePath: target, input: Buffer.from([0, 255, 128, 43]) })).kind, 'Pass');
  const input = Buffer.from([33, 0, 255, 128]);
  const inputPath = path.join(temp, 'input');
  await writeFile(inputPath, input);
  const run = file => spawnSync(process.execPath, [cli, 'run', '--module', target, '--input', file, '--out', path.join(temp, 'findings')], { encoding: 'utf8' });
  const first = run(inputPath);
  assert.equal(first.status, 1, first.stderr);
  const finding = JSON.parse(first.stdout);
  assert.equal(finding.kind, 'PropertyFailure');
  const saved = path.join(finding.finding, 'input');
  assert.deepEqual(await readFile(saved), input);
  const replay = run(saved);
  assert.equal(replay.status, 1, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).kind, 'PropertyFailure');
});

test('separate driver and target counters reset between A, B, A', () => {
  const module = require(instrumented);
  const dump = () => {
    const lines = [];
    const original = console.log;
    try {
      console.log = (...args) => lines.push(args.join(' '));
      module.coverage_end();
    } finally { console.log = original; }
    assert.equal(lines.shift(), '----- BEGIN MOONBIT COVERAGE -----');
    assert.equal(lines.pop(), '----- END MOONBIT COVERAGE -----');
    return JSON.parse(lines.join('\n'));
  };
  const key = 'f4ah6o/moon-fuzz-p0-example/target$target';
  const driver = 'f4ah6o/moon-fuzz-p0-example/driver$driver';
  const initialization = dump();
  assert.deepEqual(Object.keys(initialization).sort(), [driver, key]);
  assert.ok(initialization[key].some(count => count > 0));
  assert.ok(initialization[driver].some(count => count > 0));
  const sample = bytes => { module.fuzz_one(Uint8Array.from(bytes)); return dump(); };
  const a = sample([33]);
  const b = sample([0]);
  const again = sample([33]);
  expectedA = a[key].flatMap((count, index) => count !== 0 ? [{ counter_id: key, index }] : []);
  initializationOnly = initialization[key].flatMap((count, index) => count !== 0 && a[key][index] === 0 ? [index] : []);
  assert.ok(initializationOnly.length > 0);
  assert.deepEqual(again, a);
  assert.notDeepEqual(a, b);
  assert.ok(a[driver].some(count => count > 0));
  assert.ok(a[key].some((count, index) => count > 0 && b[key][index] === 0));
  assert.ok(b[key].some((count, index) => count > 0 && a[key][index] === 0));
  const empty = dump();
  assert.ok(empty[key].every(count => count === 0));
  assert.ok(empty[driver].every(count => count === 0));
});

test('coverage adapter selects target probes in fresh workers and isolates initialization', async () => {
  const coveragePackage = 'f4ah6o/moon-fuzz-p0-example/target';
  const sample = async bytes => execute({ modulePath: instrumented, input: Buffer.from(bytes), guidance: 'coverage', coveragePackage });
  const a = await sample([33]);
  const b = await sample([0]);
  const again = await sample([33]);
  assert.equal(a.kind, 'PropertyFailure');
  assert.equal(b.kind, 'Pass');
  assert.deepEqual(a.coverage, again.coverage);
  assert.notDeepEqual(a.coverage.features, b.coverage.features);
  assert.ok(a.coverage.features.length > 0);
  assert.ok(a.coverage.features.every(feature => feature.counter_id.startsWith(`${coveragePackage}$`)));
  assert.deepEqual(a.coverage.features, expectedA);
  assert.ok(a.coverage.features.every(feature => !initializationOnly.includes(feature.index)));
  assert.equal(a.coverage.build_sha256, createHash('sha256').update(await readFile(instrumented)).digest('hex'));
  const missing = await execute({ modulePath: instrumented, input: Buffer.alloc(0), guidance: 'coverage', coveragePackage: `${coveragePackage}x` });
  assert.equal(missing.kind, 'InfrastructureError');
  assert.match(missing.message, /no coverage counters/);
  const plain = await execute({ modulePath: target, input: Buffer.alloc(0), guidance: 'coverage', coveragePackage });
  assert.equal(plain.kind, 'InfrastructureError');
  const crash = await sample([88]);
  assert.equal(crash.kind, 'Crash');
  assert.equal(crash.code, 17);
  assert.equal(crash.coverage, undefined);
  const timeout = await execute({ modulePath: instrumented, input: Buffer.from([72]), guidance: 'coverage', coveragePackage, timeoutMs: 250 });
  assert.equal(timeout.kind, 'Timeout');
  assert.equal(timeout.coverage, undefined);
});

test('CLI records MoonBit coverage with the saved finding', async () => {
  const input = path.join(temp, 'coverage-input');
  await writeFile(input, Buffer.from([33, 0, 255]));
  const result = spawnSync(process.execPath, [cli, 'run', '--module', instrumented, '--input', input, '--guidance', 'coverage', '--coverage-package', 'f4ah6o/moon-fuzz-p0-example/target', '--out', path.join(temp, 'covered-findings')], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.kind, 'PropertyFailure');
  assert.deepEqual(output.coverage.features, expectedA);
  assert.deepEqual(await readFile(path.join(output.finding, 'input')), Buffer.from([33, 0, 255]));
  const metadata = JSON.parse(await readFile(path.join(output.finding, 'metadata.json'), 'utf8'));
  assert.equal(metadata.guidance, 'coverage');
  assert.deepEqual(metadata.result.coverage, output.coverage);
});
