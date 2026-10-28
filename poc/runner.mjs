import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const worker = fileURLToPath(new URL('./worker.cjs', import.meta.url));
const LOG_LIMIT = 64 * 1024;

export async function execute({ modulePath, input, timeoutMs = 1000, startupTimeoutMs = 5000 }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647 ||
      !Number.isSafeInteger(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 2147483647) {
    throw new Error('timeouts must be integers between 1 and 2147483647 ms');
  }
  if (!Buffer.isBuffer(input)) throw new Error('input must be a Buffer');
  const target = path.resolve(modulePath);
  return await new Promise((resolve, reject) => {
    const child = fork(worker, [], { silent: true, execArgv: [] });
    let phase = 'startup', outcome, timer, stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), truncated = false;
    const capture = (which, chunk) => {
      const current = which === 'stdout' ? stdout : stderr;
      const remaining = Math.max(0, LOG_LIMIT - current.length);
      if (chunk.length > remaining) truncated = true;
      const next = Buffer.concat([current, chunk.subarray(0, remaining)]);
      if (which === 'stdout') stdout = next; else stderr = next;
    };
    child.stdout.on('data', chunk => capture('stdout', chunk));
    child.stderr.on('data', chunk => capture('stderr', chunk));
    const deadline = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!outcome) outcome = { kind: phase === 'execution' ? 'Timeout' : 'InfrastructureError', phase, message: 'deadline exceeded' }; child.kill('SIGKILL'); }, ms);
    };
    deadline(startupTimeoutMs);
    child.on('message', message => {
      if (outcome || !message || typeof message !== 'object') return;
      if (message.type === 'started' && phase === 'startup') { phase = 'execution'; deadline(timeoutMs); }
      else if (message.type === 'result' && phase === 'execution' && ['pass', 'reject', 'fail'].includes(message.verdict)) {
        outcome = { kind: message.verdict === 'fail' ? 'PropertyFailure' : message.verdict === 'reject' ? 'Reject' : 'Pass', phase };
      } else if (message.type === 'uncaught' && phase === 'execution') outcome = { kind: 'UncaughtError', phase, message: String(message.message).slice(0, LOG_LIMIT) };
      else if (message.type === 'infrastructure') outcome = { kind: 'InfrastructureError', phase, message: String(message.message).slice(0, LOG_LIMIT) };
      else outcome = { kind: 'InfrastructureError', phase, message: 'invalid worker protocol' };
      if (outcome) deadline(1000);
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (!outcome) outcome = { kind: phase === 'execution' ? 'Crash' : 'InfrastructureError', phase, message: 'worker exited without a result' };
      else if (['Pass', 'Reject'].includes(outcome.kind) && (code !== 0 || signal !== null)) {
        outcome = { kind: 'Crash', phase, message: 'worker exited abnormally after reporting a result' };
      }
      resolve({ ...outcome, code, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), logsTruncated: truncated });
    });
    child.send({ type: 'run', module: target, input: input.toString('base64') }, error => {
      if (error && !outcome) { outcome = { kind: 'InfrastructureError', phase, message: error.message }; child.kill('SIGKILL'); }
    });
  });
}

export async function saveFinding({ directory, input, modulePath, timeoutMs, startupTimeoutMs, result }) {
  await mkdir(directory, { recursive: true });
  const id = `${createHash('sha256').update(input).digest('hex')}-${randomUUID()}`;
  const temp = path.join(directory, `.${id}.tmp`), destination = path.join(directory, id);
  await mkdir(temp);
  try {
    const { stdout, stderr, ...classification } = result;
    const metadata = { schema_version: 1, input_sha256: createHash('sha256').update(input).digest('hex'), module: path.resolve(modulePath), node_version: process.version, timeout_ms: timeoutMs, startup_timeout_ms: startupTimeoutMs, result: classification };
    await Promise.all([
      writeFile(path.join(temp, 'input'), input),
      writeFile(path.join(temp, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n'),
      writeFile(path.join(temp, 'stdout.log'), stdout),
      writeFile(path.join(temp, 'stderr.log'), stderr),
    ]);
    await rename(temp, destination);
  } catch (error) { await rm(temp, { recursive: true, force: true }); throw error; }
  return destination;
}
