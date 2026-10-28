#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { execute, saveFinding } from './runner.mjs';

const usage = 'Usage: node poc/cli.mjs run --module FILE --input FILE [--guidance none|coverage] [--coverage-package NAME] [--timeout MS] [--startup-timeout MS] [--coverage-timeout MS] [--out DIR]';
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === 'help') { console.log(usage); process.exit(0); }
  if (command !== 'run' || args.length % 2) throw new Error(usage);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--module', '--input', '--timeout', '--startup-timeout', '--coverage-timeout', '--guidance', '--coverage-package', '--out'].includes(args[i]) || opts[args[i]] !== undefined) throw new Error(usage);
    opts[args[i]] = args[i + 1];
  }
  if (!opts['--module'] || !opts['--input']) throw new Error(usage);
  const input = await readFile(opts['--input']);
  const timeoutMs = opts['--timeout'] === undefined ? 1000 : Number(opts['--timeout']);
  const startupTimeoutMs = opts['--startup-timeout'] === undefined ? 5000 : Number(opts['--startup-timeout']);
  const coverageTimeoutMs = opts['--coverage-timeout'] === undefined ? 1000 : Number(opts['--coverage-timeout']);
  const guidance = opts['--guidance'] ?? 'none';
  const coveragePackage = opts['--coverage-package'];
  const modulePath = opts['--module'];
  const result = await execute({ modulePath, input, timeoutMs, startupTimeoutMs, coverageTimeoutMs, guidance, coveragePackage });
  let finding;
  if (['PropertyFailure', 'UncaughtError', 'Crash', 'Timeout'].includes(result.kind)) {
    finding = await saveFinding({ directory: opts['--out'] || 'fuzz/artifacts/p0', input, modulePath, timeoutMs, startupTimeoutMs, coverageTimeoutMs, guidance, coveragePackage, result });
  }
  const failed = result.kind === 'InfrastructureError' || result.coverageError;
  console.log(JSON.stringify({ status: failed ? 'failed' : 'completed', ...result, finding }));
  process.exitCode = failed ? 2 : finding ? 1 : 0;
} catch (error) { console.error(String(error.message || error)); process.exitCode = 2; }
