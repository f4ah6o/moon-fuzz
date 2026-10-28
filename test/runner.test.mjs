import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../poc/runner.mjs';

const target = fileURLToPath(new URL('../fixtures/target.cjs', import.meta.url));
const hang = fileURLToPath(new URL('../fixtures/startup-hang.cjs', import.meta.url));
const cli = fileURLToPath(new URL('../poc/cli.mjs', import.meta.url));
const run = byte => execute({ modulePath: target, input: Buffer.from([byte]), timeoutMs: 250 });

test('pass, reject, failure and thrown errors remain distinct', async () => {
  assert.equal((await run(0)).kind, 'Pass');
  assert.equal((await run(1)).kind, 'Reject');
  const failure = await run(2);
  assert.equal(failure.kind, 'PropertyFailure');
  assert.match(failure.stdout, /target output/);
  const error = await run(3);
  assert.equal(error.kind, 'UncaughtError');
  assert.match(error.message, /fixture error/);
});

test('supervisor stops synchronous loops and records abnormal exit', async () => {
  const timeout = await run(4);
  assert.equal(timeout.kind, 'Timeout');
  assert.equal(timeout.phase, 'execution');
  assert.equal(timeout.signal, 'SIGKILL');
  const crash = await run(5);
  assert.equal(crash.kind, 'Crash');
  assert.equal(crash.code, 17);
});

test('startup failure, startup timeout and invalid return are infrastructure errors', async () => {
  assert.equal((await execute({ modulePath: target + '.missing', input: Buffer.alloc(0) })).kind, 'InfrastructureError');
  const stalled = await execute({ modulePath: hang, input: Buffer.alloc(0), startupTimeoutMs: 250 });
  assert.equal(stalled.kind, 'InfrastructureError');
  assert.equal(stalled.phase, 'startup');
  assert.equal((await run(7)).kind, 'InfrastructureError');
});

test('target output is bounded and does not corrupt the control protocol', async () => {
  const result = await run(6);
  assert.equal(result.kind, 'Pass');
  assert.equal(Buffer.byteLength(result.stdout), 65536);
  assert.equal(result.logsTruncated, true);
});

test('CLI saves exact failing bytes and metadata and can replay them', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-test-'));
  try {
    const input = Buffer.from([2, 0, 255, 42]);
    const file = path.join(temp, 'case');
    await writeFile(file, input);
    const args = [cli, 'run', '--module', target, '--input', file, '--out', path.join(temp, 'findings')];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 1, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.kind, 'PropertyFailure');
    assert.deepEqual(await readFile(path.join(result.finding, 'input')), input);
    const metadata = JSON.parse(await readFile(path.join(result.finding, 'metadata.json'), 'utf8'));
    assert.equal(metadata.result.kind, 'PropertyFailure');
    const replay = spawnSync(process.execPath, [cli, 'run', '--module', target, '--input', path.join(result.finding, 'input'), '--out', path.join(temp, 'replays')], { encoding: 'utf8' });
    assert.equal(replay.status, 1, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).kind, 'PropertyFailure');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
