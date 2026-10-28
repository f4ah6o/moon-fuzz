'use strict';

process.on('message', message => {
  if (!message || message.type !== 'run') return;
  let target;
  try {
    target = require(message.module);
    if (typeof target.fuzz_one !== 'function') throw new Error('module must export fuzz_one');
  } catch (error) {
    process.send({ type: 'infrastructure', message: String(error.stack || error) }, () => process.exit(2));
    return;
  }
  process.send({ type: 'started' }, () => {
    try {
      const result = target.fuzz_one(Uint8Array.from(Buffer.from(message.input, 'base64')));
      if (!Number.isInteger(result) || result < 0 || result > 2) {
        process.send({ type: 'infrastructure', message: 'fuzz_one must synchronously return 0, 1, or 2' }, () => process.exit(2));
        return;
      }
      process.send({ type: 'result', verdict: ['pass', 'reject', 'fail'][result] }, () => process.exit(0));
    } catch (error) {
      process.send({ type: 'uncaught', message: String(error && (error.stack || error)) }, () => process.exit(1));
    }
  });
});
