// Runs every tests/*.test.cjs in its own Node process (name order) and stops at the first failure.
const { execFileSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path');
const files = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.test.cjs'))
  .sort();
let failed = 0;
for (const f of files) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, f)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    for (const line of out.split('\n')) if (line.startsWith('PASS')) console.log(line);
  } catch (e) {
    failed++;
    console.error('FAIL ' + f + '\n' + (e.stdout || '') + (e.stderr || ''));
  }
}
console.log(files.length - failed + '/' + files.length + ' suites OK');
if (failed) process.exitCode = 1;
