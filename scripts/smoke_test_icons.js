/** Smoke-test MLBMA icon resolution in Node (no browser). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'mlbma_icons.js'), 'utf8');
const sandbox = {
  window: {},
  console,
  document: { readyState: 'complete', addEventListener: function() {}, body: { querySelectorAll: function() { return []; } } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const I = sandbox.window.MLBMAIcons;
if (!I) throw new Error('MLBMAIcons not exported');

const LINE_EXPECT = new Set(['wind', 'arrow-right', 'arrow-up', 'arrow-down', 'arrow-left-right']);

const checks = [
  // Tool cards / data-lucide
  'calendar-days', 'trophy', 'trending-up', 'swords', 'target', 'book-open', 'arrow-right',
  // Platform CTAs
  'flask-conical',
  // Profile sections
  'rotation', 'lineup', 'bullpen', 'batting', 'insight', 'split', 'spark', 'shield', 'users',
  'staff-snapshot', 'rotation-section', 'bullpen-section', 'offense-profile', 'rolling-trend',
  'platoon-profile', 'fade-conditions', 'research-note', 'totals-lean', 'matchup-risk',
  // Research lab
  'edge', 'trend-up', 'discipline',
  // Wind micro
  'wind',
];

let failed = 0;
checks.forEach(function(name) {
  const file = I.markFile(name);
  const svg = I.iconSvg(name);
  const micro = I.iconSvg(name, { px: 13, preferLine: true });
  if (LINE_EXPECT.has(name) || name.startsWith('arrow')) {
    if (!svg.includes('<svg')) { console.error('FAIL line full', name); failed++; }
    if (!micro.includes('<svg')) { console.error('FAIL line micro', name); failed++; }
    return;
  }
  if (!file) { console.error('FAIL no markFile', name); failed++; return; }
  if (!svg.includes('<img') || !svg.includes(file + '.png')) {
    console.error('FAIL iconSvg img', name, 'file', file, 'expected .png'); failed++;
  }
});

// Every PROFILE_ICONS target must resolve
Object.values(I.PROFILE_ICONS).forEach(function(target) {
  if (!I.markFile(target) && !I.iconSvg(target, { preferLine: true }).includes('<svg')) {
    console.error('FAIL profile target', target); failed++;
  }
});

if (failed) process.exit(1);
console.log('icon smoke test ok:', checks.length, 'checks +', Object.keys(I.PROFILE_ICONS).length, 'profile targets');
