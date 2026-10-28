import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../poc/runner.mjs';

const target = fileURLToPath(new URL('../fixtures/coverage.cjs', import.meta.url));
const cli = fileURLToPath(new URL('../poc/cli.mjs', import.meta.url));
const run = mode => execute({ modulePath: target, input: Buffer.from([mode]), guidance: 'coverage', coveragePackage: 'example/target', coverageTimeoutMs: 150 });

test('adapter filters exact packages and keeps target output outside the dump', async () => {
  const result = await run(0);
  assert.equal(result.kind, 'Pass');
  assert.deepEqual(result.coverage.features, [{ counter_id: 'example/target$file', index: 0 }]);
  assert.match(result.stdout, /target diagnostic/);
  assert.doesNotMatch(result.stdout, /BEGIN MOONBIT COVERAGE/);
});

test('coverage failure is infrastructure failure unless a finding must be preserved', async () => {
  const broken = await run(1);
  assert.equal(broken.kind, 'InfrastructureError');
  assert.equal(broken.phase, 'coverage');
  assert.match(broken.message, /broken coverage/);
  const failure = await run(2);
  assert.equal(failure.kind, 'PropertyFailure');
  assert.match(failure.coverageError, /broken coverage/);
  const timeout = await run(3);
  assert.equal(timeout.kind, 'PropertyFailure');
  assert.match(timeout.coverageError, /deadline/);
  const thrown = await run(10);
  assert.equal(thrown.kind, 'UncaughtError');
  assert.match(thrown.message, /target exception/);
  assert.match(thrown.coverageError, /broken coverage/);
  const exit = await run(6);
  assert.equal(exit.kind, 'InfrastructureError');
  assert.equal(exit.phase, 'coverage');
  assert.equal(exit.code, 18);
  assert.match((await run(7)).message, /did not reset/);
  assert.match((await run(8)).message, /layout changed/);
});

test('feature namespaces change when the bundled artifact changes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-build-id-'));
  try {
    const copy = path.join(temp, 'target.cjs');
    const original = await readFile(target, 'utf8');
    await writeFile(copy, original);
    const sample = () => execute({ modulePath: copy, input: Buffer.alloc(0), guidance: 'coverage', coveragePackage: 'example/target' });
    const a = await sample();
    await writeFile(copy, `${original}\n// changed build\n`);
    const b = await sample();
    assert.equal(a.kind, 'Pass');
    assert.equal(b.kind, 'Pass');
    assert.deepEqual(a.coverage.features, b.coverage.features);
    assert.notEqual(a.coverage.build_sha256, b.coverage.build_sha256);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('target timeout and crash remain findings without a coverage dump', async () => {
  const timeout = await execute({ modulePath: target, input: Buffer.from([4]), guidance: 'coverage', coveragePackage: 'example/target', timeoutMs: 150 });
  assert.equal(timeout.kind, 'Timeout');
  assert.equal(timeout.phase, 'execution');
  const crash = await run(5);
  assert.equal(crash.kind, 'Crash');
  assert.equal(crash.code, 17);
  const thrown = await run(9);
  assert.equal(thrown.kind, 'UncaughtError');
  assert.match(thrown.message, /target exception/);
  assert.deepEqual(thrown.coverage.features, [{ counter_id: 'example/target$file', index: 0 }]);
});

test('CLI saves a finding even when coverage collection fails', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-coverage-test-'));
  try {
    const file = path.join(temp, 'input');
    await writeFile(file, Buffer.from([2, 255, 0]));
    const result = spawnSync(process.execPath, [cli, 'run', '--module', target, '--input', file, '--guidance', 'coverage', '--coverage-package', 'example/target', '--out', path.join(temp, 'findings')], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.kind, 'PropertyFailure');
    assert.equal(output.status, 'failed');
    assert.deepEqual(await readFile(path.join(output.finding, 'input')), Buffer.from([2, 255, 0]));
    const metadata = JSON.parse(await readFile(path.join(output.finding, 'metadata.json'), 'utf8'));
    assert.match(metadata.result.coverageError, /broken coverage/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('coverage configuration and unavailable counters fail explicitly', async () => {
  await assert.rejects(execute({ modulePath: target, input: Buffer.alloc(0), guidance: 'coverage' }), /exact package/);
  await assert.rejects(execute({ modulePath: target, input: Buffer.alloc(0), guidance: 'none', coveragePackage: 'example/target' }), /requires coverage/);
  const absent = await execute({ modulePath: target, input: Buffer.alloc(0), guidance: 'coverage', coveragePackage: 'example/targ' });
  assert.equal(absent.kind, 'InfrastructureError');
  assert.match(absent.message, /no coverage counters/);
});

test('startup rejects malformed dumps and counters that do not reset', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-bad-coverage-'));
  try {
    const file = path.join(temp, 'bad.cjs');
    const runBad = () => execute({ modulePath: file, input: Buffer.alloc(0), guidance: 'coverage', coveragePackage: 'example/target' });
    await writeFile(file, "exports.fuzz_one = () => 0; exports.coverage_end = () => console.log('bad');\n");
    assert.match((await runBad()).message, /invalid coverage dump delimiters/);
    await writeFile(file, `exports.fuzz_one = () => 0; exports.coverage_end = () => {
      console.log('----- BEGIN MOONBIT COVERAGE -----');
      console.log('{"example/target$file":[1]}');
      console.log('----- END MOONBIT COVERAGE -----');
    };\n`);
    const result = await runBad();
    assert.equal(result.kind, 'InfrastructureError');
    assert.match(result.message, /did not reset/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
