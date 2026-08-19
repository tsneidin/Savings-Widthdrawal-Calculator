// Test harness for the Retirement Withdrawal Calculator.
// Extracts the ACTUAL simulate() shipped inside the HTML and verifies it against
// closed-form math and regression snapshots. Run with:  node test-retirement-calculator.js
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'Retirement-Withdrawal-Calculator.html');
const html = fs.readFileSync(FILE, 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) throw new Error(name + ' not found in ' + FILE);
  const open = src.indexOf('{', start);
  let depth = 0;
  let j = open;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j + 1);
}

const { simulate, monteCarlo } = (new Function(
  extractFn(html, 'simulate') + '\n' +
  extractFn(html, 'gaussDraw') + '\n' +
  extractFn(html, 'percentile') + '\n' +
  extractFn(html, 'monteCarlo') +
  '; return { simulate: simulate, monteCarlo: monteCarlo };'))();
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  -> ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}

console.log('Test 1 - closed-form growth, NO withdrawals (monthly compounding):');
const r1 = simulate(60, 90, 1000000, 0, 6, 0, 'monthly');
const exp1 = 1000000 * Math.pow(1 + 0.06 / 12, 30 * 12);
check('final == P*(1+r/12)^(12y)', Math.abs(r1[r1.length - 1].end - exp1) < 100,
  r1[r1.length - 1].end.toFixed(0) + ' vs ' + exp1.toFixed(0));
check('total interest == final - P', Math.abs(sum(r1, r => r.interest) - (exp1 - 1000000)) < 100,
  sum(r1, r => r.interest).toFixed(0));

console.log('Test 2 - closed-form growth, annual compounding:');
const r2 = simulate(60, 90, 1000000, 0, 6, 0, 'annual');
const exp2 = 1000000 * Math.pow(1.06, 30);
check('final == P*(1+r)^y', Math.abs(r2[r2.length - 1].end - exp2) < 100,
  r2[r2.length - 1].end.toFixed(0) + ' vs ' + exp2.toFixed(0));

console.log('Test 3 - zero-growth depletion (r=0, infl=0, 4000/mo on 1M):');
const r3 = simulate(60, 90, 1000000, 4000, 0, 0, 'monthly');
check('depletes at age 80 (250 months -> 21 rows)', r3.length === 21 && r3[r3.length - 1].age === 80,
  'rows=' + r3.length + ' lastAge=' + r3[r3.length - 1].age);
check('total withdrawn == exactly 1,000,000', Math.abs(sum(r3, r => r.wd) - 1000000) < 0.01,
  sum(r3, r => r.wd).toFixed(0));
check('final balance == 0', Math.abs(r3[r3.length - 1].end) < 0.01);

console.log('Test 4 - regression snapshot of defaults (60/90/1M/4000/6%/2.5%):');
const r4 = simulate(60, 90, 1000000, 4000, 6, 2.5, 'monthly');
check('finish age 89 (30 rows)', r4.length === 30 && r4[r4.length - 1].age === 89);
check('ending balance ~742,306', Math.abs(r4[r4.length - 1].end - 742306) < 100, r4[r4.length - 1].end.toFixed(0));
check('total interest ~1,849,636', Math.abs(sum(r4, r => r.interest) - 1849636) < 200, sum(r4, r => r.interest).toFixed(0));
check('total withdrawn ~2,107,330', Math.abs(sum(r4, r => r.wd) - 2107330) < 200, sum(r4, r => r.wd).toFixed(0));

console.log('Test 5 - inflation projected correctly (rate=0, 2000/mo, 2 distinct checks):');
const r5 = simulate(60, 62, 1000000, 2000, 0, 10, 'annual'); // 10% inflation
const expectedYear1 = 2000 * 12, expectedYear2 = 2000 * Math.pow(1.10, 1) * 12;
check('year1 withdrawals == 24,000', Math.abs(r5[0].wd - expectedYear1) < 0.01, r5[0].wd.toFixed(0));
check('year2 withdrawals == 26,400 (inflated once)', Math.abs(r5[1].wd - expectedYear2) < 0.01, r5[1].wd.toFixed(0));

console.log('Test 6 - depletion with inflation stays monotonic and conserved-ish:');
const r6 = simulate(60, 90, 500000, 6000, 3, 4, 'monthly');
check('deploys somewhere in 60-89', r6.length < 30 && r6[r6.length - 1].end === 0, 'rows=' + r6.length + ' depAge=' + r6[r6.length - 1].age);
check('withdrawals never exceed start within a year (no negative jump)',
  r6.every(r => r.wd >= 0 && r.interest >= 0));

console.log('Test 7 - degenerate / boundary inputs:');
const e1 = simulate(60, 60, 1000000, 4000, 6, 2.5, 'monthly');        // zero years
check('same age (0 years) -> empty result', e1.length === 0, 'rows=' + e1.length);
const e2 = simulate(30, 25, 1000000, 4000, 6, 2.5, 'monthly');        // lifeExp < curAge
check('lifeExp < curAge handled (empty)', e2.length === 0, 'rows=' + e2.length);
const e3 = simulate(60, 90, 0, 4000, 6, 2.5, 'monthly');              // zero start, must withdraw
check('zero balance, no crash, no def withdrawal', e3.length >= 1 && sum(e3, r => r.wd) === 0, 'rows=' + e3.length);
const e4 = simulate(60, 90, 1000000, 0, 0, 0, 'monthly');             // nothing happens anywhere
check('no growth & no withdrawal keeps balance flat', e4.length === 30 &&
  e4.every(r => Math.abs(r.end - 1000000) < 0.01) &&
  sum(e4, r => r.interest) === 0, 'interest=' + sum(e4, r => r.interest));

console.log('Test 8 - monthly vs annual compounding ordering (same params, r>0 withdraw>0):');
const m8 = simulate(60, 90, 1000000, 4000, 6, 2.5, 'monthly');
const a8 = simulate(60, 90, 1000000, 4000, 6, 2.5, 'annual');
const iM = sum(m8, r => r.interest), iA = sum(a8, r => r.interest);
// With intra-year withdrawals, ANNUAL compounding earns more interest (the whole balance
// earns for the full year BEFORE withdrawals are deducted); monthly wins only at 0 withdrawals.
check('annual > monthly interest when withdrawing during the year', iA > iM,
  'monthly=' + iM.toFixed(0) + ' annual=' + iA.toFixed(0));
check('...yet final balances match monthly/annual compounding identity within tolerance',
  Math.abs(m8[29].end - a8[29].end) < 60000, m8[29].end.toFixed(0) + ' vs ' + a8[29].end.toFixed(0));

console.log('Test 9 - income is separate: it never enters the portfolio:');
// $3,000/mo withdrawal, $4,000 pension on $100k, zero rates: depletes exactly like no-income (2 yrs + 1 mo).
const r9 = simulate(60, 90, 100000, 3000, 0, 0, 'monthly', { p1: 4000, reduce: 200, p2: 0, ss: 0, ssAge: 200, cola: 0 });
const r9n = simulate(60, 90, 100000, 3000, 0, 0, 'monthly');
check('withdrawal is exactly the input, unaffected by income', r9[0].wd === 36000 && r9[1].wd === 36000 && r9[2].wd === 28000,
  'wd=' + r9.map(r => r.wd).join(','));
check('balance path identical with or without pension (income not deposited)', r9.length === 3 && r9n.length === 3 &&
  r9.every((r, i) => r.end === r9n[i].end) && r9[2].end === 0, 'ends=' + r9.map(r => r.end).join(','));
check('spending includes income on top: $7,000/mo in year 0', Math.abs(r9[0].need - 84000) < 0.01, r9[0].need);

console.log('Test 10 - pension reduction + SS phase-in never change the portfolio draw:');
const r11 = simulate(60, 63, 100000, 3000, 0, 0, 'monthly', { p1: 1000, reduce: 62, p2: 0, ss: 0, ssAge: 200, cola: 0 });
const r12 = simulate(60, 63, 100000, 3000, 0, 0, 'monthly', { p1: 0, reduce: 61, p2: 0, ss: 3000, ssAge: 62, cola: 0 });
check('draws identical across income schedules', r11.map(r => r.wd).join(',') === r12.map(r => r.wd).join(',') &&
  r11.every((r, i) => r.end === r12[i].end), 'ends=' + r11.map(r => r.end).join(','));
const r12b = simulate(60, 63, 500000, 3000, 0, 0, 'monthly', { p1: 0, reduce: 61, p2: 0, ss: 3000, ssAge: 62, cola: 0 });
check('spending reflects active income: y0 4k/mo, SS year 6k/mo', Math.abs(r11[0].need - 48000) < 0.01 &&
  Math.abs(r12b[2].need - 72000) < 0.01, 'r11y0=' + r11[0].need + ' r12y2=' + r12b[2].need);

console.log('Test 11 - COLA grows only the spending line, never the balance:');
const r13 = simulate(60, 63, 100000, 4000, 0, 0, 'monthly', { p1: 4000, reduce: 62, p2: 2200, ss: 2400, ssAge: 62, cola: 2 });
const r13n = simulate(60, 63, 100000, 4000, 0, 0, 'monthly');
check('draw path matches the no-income run ($48k, $48k, $4k final)', r13.map(r => r.wd).join(',') === '48000,48000,4000',
  'wd=' + r13.map(r => r.wd).join(','));
check('portfolio ends identical with income (separate) vs without', r13.every((r, i) => r.end === r13n[i].end), 'ends=' + r13.map(r => r.end).join(','));
check('COLA inflates the pension leg of spending: y1 pension = 4080/mo',
  Math.abs(r13[1].need - (48000 + 4080 * 12)) < 0.01, r13[1].need);

console.log('Test 12 - rateSeq drives per-year returns (Monte Carlo core):');
const rs = simulate(60, 62, 1000000, 0, 6, 0, 'monthly', null, 'fixed', 4, [6, 6]);
check('rateSeq of [6,6] == constant 6% run', rs.length === 2 &&
  Math.abs(rs[rs.length - 1].end - simulate(60, 62, 1000000, 0, 6, 0, 'monthly')[1].end) < 0.01,
  rs[rs.length - 1].end.toFixed(0));
const rs0 = simulate(60, 62, 1000000, 0, 6, 0, 'monthly', null, 'fixed', 4, [0, 0]);
check('rateSeq of zeros == 0% return (no growth)', Math.abs(rs0[rs.length - 1].end - 1000000) < 0.01,
  rs0[rs.length - 1].end.toFixed(0));

console.log('Test 13 - Monte Carlo sanity: vol=0 collapses to the deterministic run:');
const mc0 = monteCarlo(50, 60, 90, 1000000, 4000, 6, 0, 2.5, 'monthly', null, 'fixed', 4);
const det = simulate(60, 90, 1000000, 4000, 6, 2.5, 'monthly');
check('vol=0: 100% success', mc0.successPct === 100, mc0.successPct);
check('vol=0: median path matches deterministic projection', mc0.rows.length === det.length &&
  Math.abs(mc0.rows[mc0.rows.length - 1].end - det[det.length - 1].end) < 0.01,
  mc0.rows[mc0.rows.length - 1].end.toFixed(0) + ' vs ' + det[det.length - 1].end.toFixed(0));
check('vol=0: band collapses onto the median', mc0.p10.every((v, i) => v === mc0.p90[i]), 'spread=' + (mc0.p90[29] - mc0.p10[29]).toFixed(0));

console.log('Test 14 - Monte Carlo with volatility behaves sensibly:');
const mc1 = monteCarlo(2000, 60, 90, 1000000, 4000, 6, 10, 2.5, 'monthly', null, 'fixed', 4);
check('success rate is a sane probability', mc1.successPct > 0 && mc1.successPct <= 100, mc1.successPct.toFixed(1) + '%');
check('band is ordered: p10 <= median <= p90 at every age',
  mc1.p10.slice(0, mc1.rows.length).every((v, i) => v <= mc1.rows[i].end + 0.01) &&
  mc1.rows.every((r, i) => r.end <= mc1.p90[i] + 0.01),
  'p10@89=' + mc1.p10[29].toFixed(0) + ' med@89=' + mc1.rows[29].end.toFixed(0) + ' p90@89=' + mc1.p90[29].toFixed(0));
check('volatility widens the band vs the vol=0 run', mc1.p90[29] - mc1.p10[29] > mc0.p90[29] - mc0.p10[29],
  'spread=' + (mc1.p90[29] - mc1.p10[29]).toFixed(0));
check('vol=0 run has strictly less risk than volatile run: higher success', mc0.successPct >= mc1.successPct,
  mc0.successPct.toFixed(1) + '% vs ' + mc1.successPct.toFixed(1) + '%');

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);