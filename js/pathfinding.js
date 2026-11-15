/**
 * MarsPath - Pathfinding (A* on the terrain grid)
 * Edge cost  c(i,j) = d * [1 + ws*S + wr*R + wu*U + wh*H]      (PDF section 6.3)
 *   S = (edge slope / maxSlope)^2   R = slope variability / ref   U = no-data   H = caution zone
 * Hard blocks: no-go cells, cells steeper than maxSlope, edges steeper than maxSlope,
 * (optionally) no-data cells. Diagonals may not cut corners of blocked cells.
 * Heuristic: octile distance * cellSize (admissible because every penalty is >= 0).
 */
(function (root) {
    'use strict';
    const DEG = Math.PI / 180;
    const SQ2 = Math.SQRT2;
    const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

    class MinHeap {
        constructor() { this.k = []; this.v = []; }
        get size() { return this.k.length; }
        push(key, val) {
            const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
            while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
            k[i] = key; v[i] = val;
        }
        pop() {
            const k = this.k, v = this.v, topV = v[0], lastK = k.pop(), lastV = v.pop();
            if (k.length) {
                let i = 0; const n = k.length;
                for (;;) {
                    let l = 2 * i + 1; if (l >= n) break;
                    if (l + 1 < n && k[l + 1] < k[l]) l++;
                    if (k[l] >= lastK) break;
                    k[i] = k[l]; v[i] = v[l]; i = l;
                }
                k[i] = lastK; v[i] = lastV;
            }
            return topV;
        }
    }

    /** Build cost helpers for one grid + mode options. */
    function costModel(grid, opts) {
        const o = Object.assign({ ws: 0, wr: 0, wu: 0, wh: 0, maxSlope: 25, blockUnknown: false, roughRef: 8 }, opts);
        const blockedCell = i => grid.nogo[i] === 1 || grid.slope[i] > o.maxSlope || (o.blockUnknown && grid.unknown[i] === 1);
        const stepCost = (a, b, d) => {
            const dz = (grid.unknown[a] || grid.unknown[b]) ? 0 : Math.abs(grid.elev[b] - grid.elev[a]);
            const es = Math.atan(dz / d) / DEG;
            if (es > o.maxSlope) return Infinity;
            const S = (es / o.maxSlope) ** 2;
            const R = Math.min(1, ((grid.rough[a] + grid.rough[b]) / 2) / o.roughRef);
            const U = (grid.unknown[a] + grid.unknown[b]) / 2;
            const H = (grid.haz[a] + grid.haz[b]) / 2;
            return d * (1 + o.ws * S + o.wr * R + o.wu * U + o.wh * H);
        };
        return { o, blockedCell, stepCost };
    }

    /**
     * @returns {{found:boolean, path:number[], cost:number, expanded:number}}
     * opts.useHeuristic=false => Dijkstra (for verification)
     */
    function search(grid, start, goal, opts, useHeuristic = true) {
        const { blockedCell, stepCost } = costModel(grid, opts);
        const { nx, ny, cell } = grid;
        const N = nx * ny;
        if (start < 0 || goal < 0 || blockedCell(start) || blockedCell(goal)) return { found: false, path: [], cost: Infinity, expanded: 0 };
        const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
        const [gr, gc] = grid.rc(goal);
        const h = i => {
            if (!useHeuristic) return 0;
            const r = Math.floor(i / nx), c = i % nx;
            const dr = Math.abs(r - gr), dc = Math.abs(c - gc);
            return cell * ((dr + dc) + (SQ2 - 2) * Math.min(dr, dc));
        };
        const heap = new MinHeap(); g[start] = 0; heap.push(h(start), start);
        let expanded = 0;
        while (heap.size) {
            const cur = heap.pop();
            if (closed[cur]) continue;
            closed[cur] = 1; expanded++;
            if (cur === goal) break;
            const r = Math.floor(cur / nx), c = cur % nx;
            for (let k = 0; k < 8; k++) {
                const rr = r + NB[k][0], cc = c + NB[k][1];
                if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
                const nb = rr * nx + cc;
                if (closed[nb] || blockedCell(nb)) continue;
                const diag = k >= 4;
                if (diag && (blockedCell(r * nx + cc) || blockedCell(rr * nx + c))) continue;   // no corner cutting
                const sc = stepCost(cur, nb, diag ? cell * SQ2 : cell);
                if (sc === Infinity) continue;
                const ng = g[cur] + sc;
                if (ng < g[nb]) { g[nb] = ng; prev[nb] = cur; heap.push(ng + h(nb), nb); }
            }
        }
        if (g[goal] === Infinity) return { found: false, path: [], cost: Infinity, expanded };
        const path = []; for (let i = goal; i !== -1; i = prev[i]) path.push(i);
        path.reverse();
        return { found: true, path, cost: g[goal], expanded };
    }
    const aStar = (grid, s, g, o) => search(grid, s, g, o, true);
    const dijkstra = (grid, s, g, o) => search(grid, s, g, o, false);

    /** Nearest traversable cell to idx (ring search), or -1. */
    function snap(grid, idx, opts, maxRing = 40) {
        const { blockedCell } = costModel(grid, opts);
        if (idx >= 0 && !blockedCell(idx)) return idx;
        if (idx < 0) return -1;
        const [r0, c0] = grid.rc(idx);
        for (let ring = 1; ring <= maxRing; ring++) {
            let best = -1, bd = Infinity;
            for (let r = r0 - ring; r <= r0 + ring; r++) for (let c = c0 - ring; c <= c0 + ring; c++) {
                if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring || !grid.inBounds(r, c)) continue;
                const i = grid.idx(r, c);
                if (blockedCell(i)) continue;
                const d = (r - r0) ** 2 + (c - c0) ** 2;
                if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0) return best;
        }
        return -1;
    }

    /** Summarise a cell path: distance, slopes, profile, hazards, time, warnings. */
    function summarize(grid, path, cfg, opts) {
        const { stepCost } = costModel(grid, opts);
        const sm = cfg.speedModel;
        let dist = 0, dist3 = 0, cost = 0, gain = 0, loss = 0, minutes = 0, unknownCells = 0;
        const slopes = [], profile = [], hazSet = new Set();
        let cum = 0;
        path.forEach((i, k) => {
            if (grid.hazId[i] >= 0) hazSet.add(grid.hazId[i]);
            if (grid.unknown[i]) unknownCells++;
            if (k === 0) { profile.push({ d: 0, z: grid.elev[i], slope: 0 }); return; }
            const a = path[k - 1];
            const [ra, ca] = grid.rc(a), [rb, cb] = grid.rc(i);
            const d = (ra !== rb && ca !== cb) ? grid.cell * SQ2 : grid.cell;
            const dz = grid.elev[i] - grid.elev[a];
            const es = Number.isNaN(dz) ? 0 : Math.atan(Math.abs(dz) / d) / DEG;
            dist += d; dist3 += Math.hypot(d, Number.isNaN(dz) ? 0 : dz); cost += stepCost(a, i, d);
            if (dz > 0) gain += dz; else if (dz < 0) loss -= dz;
            slopes.push(es); cum += d;
            const v = sm.flatKmh * Math.max(sm.minFactor, 1 - es / sm.slopeDegAtMin);
            minutes += (d / 1000) / v * 60;
            profile.push({ d: cum, z: grid.elev[i], slope: es });
        });
        const sorted = slopes.slice().sort((x, y) => x - y);
        const pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
        const warnings = [];
        if (grid.meta.synthetic) warnings.push('Terrain is SYNTHETIC (model, not NASA data) - route is a software demonstration only.');
        warnings.push(`Slope/roughness resolved at ${grid.cell} m cells: small rocks, boulders and loose soil are NOT assessed.`);
        if (hazSet.size) warnings.push('Route enters caution zone(s): ' + [...hazSet].map(z => grid.hazardList[z].label).join('; '));
        if (unknownCells) warnings.push(`${unknownCells} no-data cell(s) on route.`);
        return {
            distanceM: dist, distance3dM: dist3, cost, maxSlope: sorted.length ? sorted[sorted.length - 1] : 0,
            p95Slope: pct(0.95), meanSlope: slopes.length ? slopes.reduce((x, y) => x + y, 0) / slopes.length : 0,
            gain, loss, minutes, profile, cautionZones: [...hazSet].map(z => grid.hazardList[z]), unknownCells, warnings
        };
    }

    /**
     * Plan a route through [start, ...via, end] lat/lng points using a named mode.
     * @returns {{ok:boolean, reason?:string, latlngs:number[][], cells:number[], summary:Object, expanded:number, snapped:boolean[]}}
     */
    function planRoute(grid, points, modeKey, cfg) {
        const opts = Object.assign({ roughRef: cfg.roughnessRefDeg }, cfg.modes[modeKey]);
        const cells = []; const snapped = [];
        for (const p of points) {
            const raw = grid.latLngToCell(p[0], p[1]);
            if (raw < 0) return { ok: false, reason: 'A waypoint is outside the terrain-grid study area.' };
            const s = snap(grid, raw, opts);
            if (s < 0) return { ok: false, reason: 'No traversable cell near a waypoint.' };
            snapped.push(s !== raw); cells.push(s);
        }
        let full = [], expanded = 0; const legEnds = [];
        for (let k = 1; k < cells.length; k++) {
            const r = aStar(grid, cells[k - 1], cells[k], opts);
            expanded += r.expanded;
            if (!r.found) return { ok: false, reason: `No route found between waypoint ${k} and ${k + 1} under "${opts.label || modeKey}" limits.` };
            full = full.concat(k === 1 ? r.path : r.path.slice(1)); legEnds.push(full.length - 1);
        }
        if (full.length < 2) return { ok: false, reason: 'Need two distinct waypoints.' };
        return { ok: true, cells: full, latlngs: full.map(i => grid.cellToLatLng(i)), summary: summarize(grid, full, cfg, opts), expanded, snapped, legEnds, mode: modeKey };
    }

    const api = { aStar, dijkstra, snap, summarize, planRoute, costModel, MinHeap };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.MarsPathfinding = api;
})(typeof window !== 'undefined' ? window : globalThis);
