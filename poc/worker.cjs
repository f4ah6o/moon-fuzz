'use strict';

function finish(message, code) {
  // Drain queued target output and the result message before ending the fresh
  // worker, even if the target left timers or other handles behind.
  let pending = 3;
  const done = () => { if (--pending === 0) process.exit(code); };
  process.send(message, done);
  process.stdout.write('', done);
  process.stderr.write('', done);
}

process.on('message', message => {
  if (!message || message.type !== 'run') return;
  let target;
  try {
    target = require(message.module);
    if (typeof target.fuzz_one !== 'function') throw new Error('module must export fuzz_one');
  } catch (error) {
    finish({ type: 'infrastructure', message: String(error.stack || error) }, 2);
    return;
  }
  process.send({ type: 'started' }, () => {
    try {
      const result = target.fuzz_one(Uint8Array.from(Buffer.from(message.input, 'base64')));
      if (!Number.isInteger(result) || result < 0 || result > 2) {
        finish({ type: 'infrastructure', message: 'fuzz_one must synchronously return 0, 1, or 2' }, 2);
        return;
      }
      finish({ type: 'result', verdict: ['pass', 'reject', 'fail'][result] }, 0);
    } catch (error) {
      finish({ type: 'uncaught', message: String(error && (error.stack || error)) }, 1);
    }
  });
});
