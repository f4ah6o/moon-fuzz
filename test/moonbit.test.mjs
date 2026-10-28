import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../examples/moonbit/_build/js/debug/build/target/target.js', import.meta.url));
const cli = fileURLToPath(new URL('../poc/cli.mjs', import.meta.url));

test('generated CommonJS export accepts raw bytes and returns MoonBit verdicts', () => {
  const { fuzz_one } = createRequire(import.meta.url)(target);
  assert.equal(typeof fuzz_one, 'function');
  assert.equal(fuzz_one(Uint8Array.of()), 0);
  assert.equal(fuzz_one(Uint8Array.of(0, 255)), 0);
  assert.equal(fuzz_one(Uint8Array.of(33)), 2);
  assert.equal(fuzz_one(Uint8Array.of(66, 0, 255, 42)), 2);
  assert.equal(fuzz_one(Uint8Array.of(82)), 1);
});

test('CLI classifies MoonBit outcomes and replays the exact saved inputs', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moon-fuzz-moonbit-'));
  const invoke = input => {
    const result = spawnSync(process.execPath, [cli, 'run', '--module', target, '--input', input,
      '--timeout', '500', '--startup-timeout', '10000', '--out', path.join(temp, 'findings')],
    { encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { code: result.status, json: JSON.parse(result.stdout) };
  };
  try {
    const cases = [
      { bytes: Buffer.alloc(0), kind: 'Pass', code: 0 },
      { bytes: Buffer.from([0, 255]), kind: 'Pass', code: 0 },
      { bytes: Buffer.from('R'), kind: 'Reject', code: 0 },
      { bytes: Buffer.from('!'), kind: 'PropertyFailure', code: 1 },
      { bytes: Buffer.from([66, 0, 255, 42]), kind: 'PropertyFailure', code: 1 },
      { bytes: Buffer.from('X'), kind: 'Crash', code: 1 },
      { bytes: Buffer.from('H'), kind: 'Timeout', code: 1 },
    ];
    for (const [index, item] of cases.entries()) {
      const file = path.join(temp, `input-${index}`);
      await writeFile(file, item.bytes);
      const first = invoke(file);
      assert.equal(first.code, item.code, item.kind);
      assert.equal(first.json.kind, item.kind);
      assert.equal(first.json.phase, 'execution');
      if (item.kind === 'Crash') assert.equal(first.json.code, 17);
      if (item.kind === 'Timeout') assert.equal(first.json.signal, 'SIGKILL');
      if (item.code === 0) { assert.equal(first.json.finding, undefined); continue; }
      const saved = path.join(first.json.finding, 'input');
      assert.deepEqual(await readFile(saved), item.bytes);
      const metadata = JSON.parse(await readFile(path.join(first.json.finding, 'metadata.json'), 'utf8'));
      assert.equal(metadata.input_sha256, createHash('sha256').update(item.bytes).digest('hex'));
      assert.equal(metadata.result.kind, item.kind);
      assert.equal(typeof await readFile(path.join(first.json.finding, 'stdout.log'), 'utf8'), 'string');
      assert.equal(typeof await readFile(path.join(first.json.finding, 'stderr.log'), 'utf8'), 'string');
      const replay = invoke(saved);
      assert.equal(replay.code, 1);
      assert.equal(replay.json.kind, item.kind);
      assert.deepEqual(await readFile(path.join(replay.json.finding, 'input')), item.bytes);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
