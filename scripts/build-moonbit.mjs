import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../examples/moonbit/', import.meta.url));
const run = (...args) => {
  const result = spawnSync('moon', args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`moon ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout + result.stderr;
};

const version = run('version', '--all');
console.log(version);
if (!/^moon 0\.1\.20261023 \(3778465 2026-10-23\)/m.test(version) ||
    !/^moonc v0\.10\.17\+d971670cd\b/m.test(version)) {
  throw new Error('MoonBit toolchain 0.10.17+d971670cd is required');
}
console.log(run('clean'));
console.log(run('build', '--target', 'js'));
