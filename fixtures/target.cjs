exports.fuzz_one = input => {
  switch (input[0]) {
    case 1: return 1;
    case 2: console.log('target output'); return 2;
    case 3: throw new Error('fixture error');
    case 4: while (true) {}
    case 5: process.exit(17); break;
    case 6: process.stdout.write('x'.repeat(100000)); return 0;
    case 7: return 'invalid';
    default: return 0;
  }
};
