/**
 * MarsPath - TerrainGrid
 * Regular lat/lng grid of elevation + derived slope/roughness/hazard layers used by the
 * A* planner. Works in browser (window.TerrainGrid) and Node (module.exports) for tests.
 *
 * Data honesty: grid.meta.synthetic === true means the elevations are a MODEL, not NASA data.
 * Load a real DEM-derived grid with TerrainGrid.fromJSON() (see tools/make_terrain_grid.py).
 */
(function (root) {
    'use strict';
    const MARS_R = 3389500;               // m, mean radius
    const DEG = Math.PI / 180;

    /* ---------- deterministic value noise ---------- */
    function hash2(ix, iy, seed) {
        let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    const smooth = t => t * t * (3 - 2 * t);
    function vnoise(x, y, seed) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = smooth(x - x0), fy = smooth(y - y0);
        const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
        const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
        const top = a + (b - a) * fx, bot = c + (d - c) * fx;
        return top + (bot - top) * fy;
    }

    class TerrainGrid {
        /**
         * @param {Object} meta {south,north,west,east,cellSize,source,synthetic}
         * @param {Float32Array|number[]} elev row-major, row 0 = north; NaN = no data
         * @param {number} [nx] @param {number} [ny] (derived from meta if omitted)
         */
        constructor(meta, elev, nx, ny) {
            this.meta = Object.assign({ synthetic: false, source: 'unknown' }, meta);
            const m = this.meta;
            this.lat0 = (m.south + m.north) / 2;
            this.mPerDegLat = MARS_R * DEG;
            this.mPerDegLon = MARS_R * DEG * Math.cos(this.lat0 * DEG);
            this.dLat = m.cellSize / this.mPerDegLat;
            this.dLon = m.cellSize / this.mPerDegLon;
            this.nx = nx || Math.ceil((m.east - m.west) / this.dLon);
            this.ny = ny || Math.ceil((m.north - m.south) / this.dLat);
            this.cell = m.cellSize;
            this.elev = Float32Array.from(elev);
            if (this.elev.length !== this.nx * this.ny) throw new Error('elevation length != nx*ny');
            const n = this.elev.length;
            this.slope = new Float32Array(n);     // degrees (Horn 3x3)
            this.rough = new Float32Array(n);     // slope variability, degrees (5x5 std dev)
            this.unknown = new Uint8Array(n);     // 1 = no data
            this.nogo = new Uint8Array(n);        // 1 = interpreted hard no-go
            this.haz = new Float32Array(n);       // 0..1 caution penalty
            this.hazId = new Int16Array(n).fill(-1);
            this.hazardList = [];
            this.computeDerived();
        }

        idx(r, c) { return r * this.nx + c; }
        rc(i) { return [Math.floor(i / this.nx), i % this.nx]; }
        inBounds(r, c) { return r >= 0 && c >= 0 && r < this.ny && c < this.nx; }

        cellToLatLng(i) {
            const [r, c] = this.rc(i);
            return [this.meta.north - (r + 0.5) * this.dLat, this.meta.west + (c + 0.5) * this.dLon];
        }
        latLngToCell(lat, lng) {
            const r = Math.floor((this.meta.north - lat) / this.dLat);
            const c = Math.floor((lng - this.meta.west) / this.dLon);
            return this.inBounds(r, c) ? this.idx(r, c) : -1;
        }
        contains(lat, lng) { return this.latLngToCell(lat, lng) >= 0; }
        get bounds() { return [[this.meta.south, this.meta.west], [this.meta.north, this.meta.east]]; }

        /** Bilinear elevation (m) at lat/lng, or null if outside / no data. */
        elevationAt(lat, lng) {
            const fr = (this.meta.north - lat) / this.dLat - 0.5;
            const fc = (lng - this.meta.west) / this.dLon - 0.5;
            const r0 = Math.floor(fr), c0 = Math.floor(fc);
            if (r0 < 0 || c0 < 0 || r0 + 1 >= this.ny || c0 + 1 >= this.nx) {
                const i = this.latLngToCell(lat, lng);
                return i < 0 || this.unknown[i] ? null : this.elev[i];
            }
            const tr = fr - r0, tc = fc - c0;
            const z = (r, c) => this.elev[this.idx(r, c)];
            const a = z(r0, c0), b = z(r0, c0 + 1), c_ = z(r0 + 1, c0), d = z(r0 + 1, c0 + 1);
            if ([a, b, c_, d].some(Number.isNaN)) return null;
            return (a * (1 - tc) + b * tc) * (1 - tr) + (c_ * (1 - tc) + d * tc) * tr;
        }

        computeDerived() {
            const { nx, ny, elev, cell } = this;
            for (let i = 0; i < elev.length; i++) this.unknown[i] = Number.isNaN(elev[i]) ? 1 : 0;
            const z = (r, c) => {
                r = Math.min(ny - 1, Math.max(0, r)); c = Math.min(nx - 1, Math.max(0, c));
                const v = elev[r * nx + c]; return v;
            };
            for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
                const i = r * nx + c;
                if (this.unknown[i]) { this.slope[i] = 0; continue; }
                const a = z(r - 1, c - 1), b = z(r - 1, c), cc = z(r - 1, c + 1),
                      d = z(r, c - 1), f = z(r, c + 1),
                      g = z(r + 1, c - 1), h = z(r + 1, c), k = z(r + 1, c + 1);
                const vals = [a, b, cc, d, f, g, h, k];
                if (vals.some(Number.isNaN)) { this.slope[i] = 0; continue; }
                const dzdx = ((cc + 2 * f + k) - (a + 2 * d + g)) / (8 * cell);
                const dzdy = ((g + 2 * h + k) - (a + 2 * b + cc)) / (8 * cell);   // rows go south
                this.slope[i] = Math.atan(Math.hypot(dzdx, dzdy)) / DEG;
            }
            for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
                let s = 0, s2 = 0, n = 0;
                for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                    const rr = r + dr, cc = c + dc;
                    if (!this.inBounds(rr, cc)) continue;
                    const v = this.slope[rr * nx + cc]; s += v; s2 += v * v; n++;
                }
                const mean = s / n;
                this.rough[r * nx + c] = Math.sqrt(Math.max(0, s2 / n - mean * mean));
            }
        }

        /** Apply interpreted hazard circles: danger/impassable => no-go, caution => cost penalty. */
        applyHazards(zones) {
            this.nogo.fill(0); this.haz.fill(0); this.hazId.fill(-1);
            this.hazardList = zones.slice();
            zones.forEach((z, zi) => {
                const rc = this.latLngToCell(z.center[0], z.center[1]);
                const span = Math.ceil(z.radius / this.cell) + 2;
                const [r0, c0] = rc >= 0 ? this.rc(rc) :
                    [Math.round((this.meta.north - z.center[0]) / this.dLat), Math.round((z.center[1] - this.meta.west) / this.dLon)];
                for (let r = r0 - span; r <= r0 + span; r++) for (let c = c0 - span; c <= c0 + span; c++) {
                    if (!this.inBounds(r, c)) continue;
                    const i = this.idx(r, c);
                    const [lat, lng] = this.cellToLatLng(i);
                    const dy = (lat - z.center[0]) * this.mPerDegLat, dx = (lng - z.center[1]) * this.mPerDegLon;
                    if (Math.hypot(dx, dy) > z.radius) continue;
                    if (z.level === 'danger' || z.level === 'impassable') this.nogo[i] = 1;
                    else this.haz[i] = Math.max(this.haz[i], 1);
                    this.hazId[i] = zi;
                }
            });
        }

        stats() {
            let mn = Infinity, mx = -Infinity, sl = 0, n = 0, nog = 0;
            for (let i = 0; i < this.elev.length; i++) {
                if (this.unknown[i]) continue;
                mn = Math.min(mn, this.elev[i]); mx = Math.max(mx, this.elev[i]);
                sl += this.slope[i]; n++; nog += this.nogo[i];
            }
            return { minElev: mn, maxElev: mx, meanSlope: sl / n, cells: this.elev.length, nogoCells: nog };
        }

        /* ---------- constructors ---------- */

        /** Deterministic SYNTHETIC terrain (model, not NASA data). */
        static synthetic(cfg) {
            const t = cfg.terrain, s = t.synthetic;
            const probe = new TerrainGrid({ south: t.south, north: t.north, west: t.west, east: t.east, cellSize: t.cellSize },
                new Float32Array(1), 1, 1);
            const nx = Math.ceil((t.east - t.west) / probe.dLon), ny = Math.ceil((t.north - t.south) / probe.dLat);
            const elev = new Float32Array(nx * ny);
            const mLat = probe.mPerDegLat, mLon = probe.mPerDegLon;
            for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
                const lat = t.north - (r + 0.5) * probe.dLat, lng = t.west + (c + 0.5) * probe.dLon;
                let z = s.floorElev;
                const dm = Math.hypot((lat - s.mound.lat) * mLat, (lng - s.mound.lng) * mLon) / 1000;
                z += s.mound.height * Math.exp(-Math.pow(dm / s.mound.sigmaKm, 2));
                const u = Math.min(1, Math.max(0, (lat - s.northRamp.latStart) / s.northRamp.spanDeg));
                z += s.northRamp.rise * smooth(u);
                for (const f of s.features) {
                    const d = Math.hypot((lat - f.lat) * mLat, (lng - f.lng) * mLon) / 1000;
                    z += f.amp * Math.exp(-Math.pow(d / f.radiusKm, 2));
                }
                const x = c * t.cellSize, y = r * t.cellSize;
                z += 30 * (vnoise(x / 8000, y / 8000, s.seed) - 0.5) + 12 * (vnoise(x / 2500, y / 2500, s.seed + 1) - 0.5)
                   + 5 * (vnoise(x / 800, y / 800, s.seed + 2) - 0.5);
                elev[r * nx + c] = z;
            }
            return new TerrainGrid({ south: t.south, north: t.north, west: t.west, east: t.east, cellSize: t.cellSize,
                synthetic: true, source: 'SYNTHETIC model (not NASA data)' }, elev, nx, ny);
        }

        /** Load a grid produced by tools/make_terrain_grid.py. null => NaN (no data). */
        static fromJSON(obj) {
            const e = obj.elevation.map(v => (v === null ? NaN : v));
            return new TerrainGrid(Object.assign({}, obj.meta, { synthetic: false }), e, obj.meta.nx, obj.meta.ny);
        }
    }

    const api = { TerrainGrid, MARS_R };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.MarsTerrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
