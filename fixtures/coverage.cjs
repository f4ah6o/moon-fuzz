'use strict';

let calls = 0;
let mode = 0;
exports.fuzz_one = input => {
  mode = input[0] || 0;
  console.log('target diagnostic');
  if (mode === 4) while (true) {}
  if (mode === 5) process.exit(17);
  if (mode === 9 || mode === 10) throw new Error('target exception');
  return mode === 2 || mode === 3 ? 2 : 0;
};
exports.coverage_end = () => {
  calls++;
  if (calls === 3 && (mode === 1 || mode === 2 || mode === 10)) throw new Error('broken coverage');
  if (calls === 3 && mode === 3) while (true) {}
  if (calls === 3 && mode === 6) process.exit(18);
  const hit = calls === 1 || calls === 3 || (calls === 4 && mode === 7) ? 1 : 0;
  console.log('----- BEGIN MOONBIT COVERAGE -----');
  console.log(JSON.stringify({ 'example/target$file': calls === 3 && mode === 8 ? [hit] : [hit, 0], 'example/target-extra$file': [hit], 'example/driver$file': [hit] }));
  console.log('----- END MOONBIT COVERAGE -----');
};
