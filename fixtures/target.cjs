exports.fuzz_one = input => {
  switch (input[0]) {
    case 1: return 1;
    case 2: console.log('target output'); return 2;
    case 3: throw new Error('fixture error');
    case 4: while (true) {}
    case 5: process.exit(17); break;
    case 6: process.stdout.write('x'.repeat(100000)); process.stderr.write('y'.repeat(100000)); return 0;
    case 7: return 'invalid';
    case 8: setInterval(() => {}, 10000); return 0;
    case 9: setTimeout(() => { throw new Error('late error'); }, 100); return 0;
    case 10: process.nextTick(() => { throw new Error('early asynchronous error'); }); return 0;
    // Exercise a result delivered before an abnormal exit in the supervisor.
    case 11: process.send({ type: 'result', verdict: 'pass' }, () => process.exit(17)); return 0;
    default: return 0;
  }
};
