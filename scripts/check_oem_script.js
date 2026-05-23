const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dashboard/chase_analytics_mlb_oem_v7.html'), 'utf8');
const start = html.indexOf('<script>\n/* ============================================================\n   GOOGLE SHEETS');
const end = html.indexOf('</script>\n\n<div class="toast"');
if (start < 0 || end < 0) {
  console.error('Could not extract script block');
  process.exit(1);
}
const js = html.slice(start + 8, end);
const tmp = path.join(__dirname, '_oem_script_check.js');
fs.writeFileSync(tmp, js);
const { spawnSync } = require('child_process');
const r = spawnSync('node', ['--check', tmp], { encoding: 'utf8' });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status || 0);
