'use strict';

const { artifactHash, createCoverage } = require('./coverage.cjs');

// Let pending pipe writes drain before exit; the supervisor still enforces a
// deadline if a target leaves handles open or the pipes cannot drain.
function finish(message, code) {
  let pending = 3;
  const done = () => { if (--pending === 0) process.exit(code); };
  process.send(message, done);
  process.stdout.write('', done);
  process.stderr.write('', done);
}

process.on('message', message => {
  if (!message || message.type !== 'run') return;
  let target, coverage;
  try {
    const hash = message.guidance === 'coverage' ? artifactHash(message.module) : undefined;
    target = require(message.module);
    if (typeof target.fuzz_one !== 'function') throw new Error('module must export fuzz_one');
    if (message.guidance === 'coverage') {
      if (artifactHash(message.module) !== hash) throw new Error('module changed during loading');
      coverage = createCoverage(target, message.coveragePackage, hash);
    }
  } catch (error) {
    finish({ type: 'infrastructure', message: String(error.stack || error) }, 2);
    return;
  }
  process.send({ type: 'started' }, () => {
    let result;
    try {
      const verdict = target.fuzz_one(Uint8Array.from(Buffer.from(message.input, 'base64')));
      if (!Number.isInteger(verdict) || verdict < 0 || verdict > 2) {
        finish({ type: 'infrastructure', message: 'fuzz_one must synchronously return 0, 1, or 2' }, 2);
        return;
      }
      result = { type: 'result', verdict: ['pass', 'reject', 'fail'][verdict] };
    } catch (error) {
      result = { type: 'uncaught', message: String(error && (error.stack || error)) };
    }
    if (!coverage) {
      finish(result, result.type === 'uncaught' ? 1 : 0);
      return;
    }
    process.send({ type: 'coverage_started', result }, () => {
      try {
        finish({ type: 'coverage', coverage: coverage.collect() }, 0);
      } catch (error) {
        finish({ type: 'coverage', error: String(error && (error.stack || error)) }, 2);
      }
    });
  });
});
