// Run:  node tests/run-tests.js      (maps to PDF section 9.2 algorithm checks)
const assert = require('assert');
const { TerrainGrid } = require('../js/terrain.js');
const PF = require('../js/pathfinding.js');
global.window = {}; require('../js/config.js'); const CFG = global.window.MarsPathConfig;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.message); } };

// flat NxM test grid with 100 m cells, optional elevation fn / nogo cells
function mk(nx, ny, zfn = () => 0, nogo = []) {
    const cell = 100, dLat = cell / (3389500 * Math.PI / 180);
    const meta = { south: 0, north: ny * dLat, west: 0, east: nx * dLat, cellSize: cell };
    const e = new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) e[r * nx + c] = zfn(r, c);
    const g = new TerrainGrid(meta, e, nx, ny);
    nogo.forEach(([r, c]) => g.nogo[g.idx(r, c)] = 1);
    return g;
}
const O = { ws: 3, wr: 1, wu: 1, wh: 1, maxSlope: 30, roughRef: 8 };

console.log('Algorithm checks');
t('A* cost equals Dijkstra cost on random terrain (optimality)', () => {
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 25; trial++) {
        const g = mk(30, 30, () => rnd() * 25);
        for (let k = 0; k < 40; k++) g.nogo[Math.floor(rnd() * 900)] = 1;
        const s = PF.snap(g, g.idx(1, 1), O), e = PF.snap(g, g.idx(28, 27), O);
        const a = PF.aStar(g, s, e, O), d = PF.dijkstra(g, s, e, O);
        assert.strictEqual(a.found, d.found);
        if (a.found) assert.ok(Math.abs(a.cost - d.cost) < 1e-6, `trial ${trial}: ${a.cost} vs ${d.cost}`);
    }
});
t('route goes AROUND a known wall obstacle', () => {
    const wall = []; for (let r = 0; r < 15; r++) wall.push([r, 10]);         // wall leaves a gap at the bottom
    const g = mk(21, 20, () => 0, wall);
    const res = PF.aStar(g, g.idx(5, 2), g.idx(5, 18), O);
    assert.ok(res.found);
    assert.ok(res.path.every(i => !g.nogo[i]), 'path crossed a blocked cell');
    assert.ok(res.path.some(i => g.rc(i)[0] >= 15), 'path did not use the gap');
});
t('a blocked cell is never crossed (stress)', () => {
    const g = mk(40, 40, (r, c) => Math.sin(r / 3) * 8 + Math.cos(c / 4) * 8);
    for (let k = 0; k < 300; k++) g.nogo[(k * 7919) % 1600] = 1;
    for (let k = 0; k < 20; k++) {
        const s = PF.snap(g, (k * 131) % 1600, O), e = PF.snap(g, (k * 977 + 5) % 1600, O);
        const r = PF.aStar(g, s, e, O);
        if (r.found) assert.ok(r.path.every(i => !g.nogo[i]));
    }
});
t('diagonal move does not cut between two blocked corner cells', () => {
    const g = mk(4, 4, () => 0, [[1, 2], [2, 1]]);        // blocked cells touching diagonally
    const r = PF.aStar(g, g.idx(1, 1), g.idx(2, 2), O);
    assert.ok(r.found);
    assert.ok(r.path.length > 2, 'took forbidden diagonal squeeze: ' + r.path.join(','));
});
t('route length uses metric cell distances (not degrees)', () => {
    const g = mk(12, 3, () => 0);
    const r = PF.aStar(g, g.idx(1, 0), g.idx(1, 10), O);
    const s = PF.summarize(g, r.path, CFG.planner, O);
    assert.ok(Math.abs(s.distanceM - 1000) < 1e-6, 'expected 1000 m, got ' + s.distanceM);
});
t('steeper-than-limit cells are blocked; planner reports no route if sealed', () => {
    const g = mk(10, 5, (r, c) => (c === 5 ? 500 : 0));        // 500 m cliff column splits the grid
    const r = PF.aStar(g, g.idx(2, 1), g.idx(2, 8), O);
    assert.strictEqual(r.found, false);
});
t('higher slope weight changes route (cautious detours around a ridge)', () => {
    const g = mk(41, 21, (r, c) => 60 * Math.exp(-(((c - 20) / 5) ** 2) - (((r - 10) / 4) ** 2)));
    const lo = Object.assign({}, O, { ws: 0, wr: 0, wh: 0, wu: 0 }), hi = Object.assign({}, O, { ws: 40 });
    const a = PF.aStar(g, g.idx(10, 2), g.idx(10, 38), lo), b = PF.aStar(g, g.idx(10, 2), g.idx(10, 38), hi);
    const sa = PF.summarize(g, a.path, CFG.planner, lo), sb = PF.summarize(g, b.path, CFG.planner, hi);
    assert.ok(sb.maxSlope <= sa.maxSlope + 1e-9, `cautious max slope ${sb.maxSlope} > shortest ${sa.maxSlope}`);
    assert.ok(sb.distanceM >= sa.distanceM - 1e-9);
});
t('snap() moves a waypoint off a no-go cell', () => {
    const g = mk(10, 10, () => 0, [[5, 5]]);
    const s = PF.snap(g, g.idx(5, 5), O); assert.ok(s >= 0 && s !== g.idx(5, 5) && !g.nogo[s]);
});

console.log('GIS / terrain checks');
t('Horn slope of a uniform 10% ramp ~ 5.71 deg', () => {
    const g = mk(10, 10, (r, c) => c * 10);        // 10 m per 100 m cell
    assert.ok(Math.abs(g.slope[g.idx(5, 5)] - Math.atan(0.1) * 180 / Math.PI) < 1e-3);
});
t('latLng <-> cell round trip', () => {
    const g = mk(20, 20); const i = g.idx(7, 13); const [la, lo] = g.cellToLatLng(i);
    assert.strictEqual(g.latLngToCell(la, lo), i);
});
t('synthetic Gale grid builds; has traversable + steep + blocked areas', () => {
    const g = TerrainGrid.synthetic(CFG); g.applyHazards(CFG.hazardZones);
    const st = g.stats(); assert.ok(st.cells > 20000 && st.meanSlope > 0.3 && st.meanSlope < 20 && st.nogoCells > 0);
    console.log('        synthetic grid:', g.nx + 'x' + g.ny, 'meanSlope', st.meanSlope.toFixed(2) + 'deg', 'elev', Math.round(st.minElev), '..', Math.round(st.maxElev));
});
t('end-to-end: hab -> Mount Sharp area, 3 modes, all valid & avoid no-go', () => {
    const g = TerrainGrid.synthetic(CFG); g.applyHazards(CFG.hazardZones);
    const pts = [[-5.40, 137.80], [-5.00, 137.85]];
    const out = {};
    for (const m of Object.keys(CFG.planner.modes)) {
        const r = PF.planRoute(g, pts, m, CFG.planner);
        assert.ok(r.ok, m + ': ' + r.reason); assert.ok(r.cells.every(i => !g.nogo[i]));
        out[m] = r.summary; console.log(`        ${m.padEnd(9)} ${(r.summary.distanceM / 1000).toFixed(2)} km  max ${r.summary.maxSlope.toFixed(1)} deg  p95 ${r.summary.p95Slope.toFixed(1)} deg  cost ${(r.summary.cost / 1000).toFixed(2)}k  expanded ${r.expanded}`);
    }
    assert.ok(out.cautious.maxSlope <= out.shortest.maxSlope + 1e-9);
});

console.log('Resource model checks');
require('../js/resources.js'); require('../js/mobility.js');
const RM = global.window.ResourceModel;
// synthetic flat route: 21 points, 200 m apart (4 km), zero slope
const prof = Array.from({ length: 21 }, (_, i) => ({ d: i * 200, z: 0, slope: 0 }));
const route = { summary: { profile: prof }, legEnds: [20], latlngs: prof.map((p, i) => [0, i * 0.003]) };
const planner = { speedModel: { flatKmh: 2.5, minFactor: 0.25, slopeDegAtMin: 35 } };
const suit = { o2ConsumptionRate: 0.15, o2ConsumptionWalking: 0.25, o2ConsumptionClimbing: 0.40, batteryDrainRate: 0.10 };
t('foot: 4 km at 2.5 km/h = 96 min -> O2 24%, battery 9.6%, no depletion', () => {
    const r = RM.compute(route, [{}, {}], 'foot', { resources: null }, { crew: 1, speed: 2.5 }, planner, suit);
    assert.ok(Math.abs(r.usedO2 - 24) < 1e-6 && Math.abs(r.usedBat - 9.6) < 1e-6 && r.dep === null);
});
t('foot: depletion found at the right distance (long stop drains O2 to 0 while on site)', () => {
    const wps = [{}, { stop: 600 }, {}], rt = { summary: { profile: prof }, legEnds: [10, 20], latlngs: route.latlngs };
    const r = RM.compute(rt, wps, 'foot', { resources: null }, { crew: 1, speed: 2.5 }, planner, suit);
    assert.ok(r.dep && r.dep.resource === 'O2' && r.dep.atStop && r.dep.index === 10, JSON.stringify(r.dep));
    assert.ok(r.o2Left < 0, 'O2 should go negative');
});
t('rover: small battery runs out mid-route; remaining goes negative; position interpolated', () => {
    const prof2 = prof.map(p => ({ ...p }));
    const prof_rover = global.window.MarsPathConfig.mobility.profiles.rover;
    const r = RM.compute(route, [{}, {}], 'rover', prof_rover, { crew: 2, speed: 12, o2CapKg: 5, batKwh: 2 }, { speedModel: { flatKmh: 12, minFactor: 0.25, slopeDegAtMin: 35 } }, suit);
    assert.ok(r.dep && r.dep.resource === 'battery' && r.dep.distM > 0 && r.dep.distM < 4000, JSON.stringify(r.dep));
    assert.ok(r.batLeft < 0);
    const mid = RM.at(r, 19, 1);
    assert.ok(mid.bat < 0 && Math.abs(mid.bat - r.batLeft) < 1e-6, 'at() end of route equals total');
    const early = RM.at(r, 0, 0); assert.ok(early.bat === 100 && early.o2 === 100);
});
t('rover: larger battery completes route with no depletion; capacity changes the result', () => {
    const rp = global.window.MarsPathConfig.mobility.profiles.rover, pl = { speedModel: { flatKmh: 12, minFactor: 0.25, slopeDegAtMin: 35 } };
    const small = RM.compute(route, [{}, {}], 'rover', rp, { crew: 2, speed: 12, o2CapKg: 5, batKwh: 5 }, pl, suit);
    const big = RM.compute(route, [{}, {}], 'rover', rp, { crew: 2, speed: 12, o2CapKg: 5, batKwh: 100 }, pl, suit);
    assert.ok(small.usedBat > big.usedBat && big.dep === null);
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
