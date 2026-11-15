/**
 * MarsPath - Environment panel (weather + radiation), wired to the HTML metric cards.
 * The numbers MOVE: they follow a modelled daily cycle driven by Gale LOCAL SOLAR TIME.
 *   - idle: real Mars time at Gale + tiny sensor-like noise
 *   - HUD walk: Mars time advances with the mission clock (120x), so the weather changes as the mission runs
 * The daily range comes from the latest Curiosity REMS report when the live feed answers, otherwise typical
 * Gale values. The cycle shape is a simple model; radiation = measured baseline (MSL RAD, Hassler 2014) x a small
 * modelled pressure-shielding swing. Labels say which parts are measured and which are modelled.
 */
class WeatherDashboard {
    constructor() {
        this.cfg = window.MarsPathConfig; const w = this.cfg.weather.current;
        this.base = { source: 'typical', min: w.temperature.min, max: w.temperature.max, pm: w.pressure.value, wind: null, uv: 'HIGH', opacity: '' };
        this.lon = 137.4;                       // Gale longitude (deg E) for local solar time
        this.area = null; this.startSim = performance.now(); this.build(); this.watchMap(); this.tick(); this.fetchLive();
        this.timer = setInterval(() => this.tick(), 1500);
    }

    /* Mars local mean solar time at Gale, hours 0-24 (Allison & McEwen 2000). */
    lmst(extraSec = 0) {
        const jd = (Date.now() + extraSec * 1000) / 86400000 + 2440587.5, jdtt = jd + 69.184 / 86400;
        const msd = (jdtt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
        return ((24 * (msd - Math.floor(msd)) + this.lon / 15) % 24 + 24) % 24;
    }
    simSeconds() { const h = window.hudOverlay; return h && h.active ? (h.elapsed || 0) : 0; }

    build() {
        const title = this.titleEl(); if (title) title.innerHTML = '<i class="fa-solid fa-cloud-sun"></i> GALE WEATHER <span class="prov-badge" id="wx-badge" style="--pc:#FF9100">TYPICAL VALUES · AREA + CYCLE MODELLED</span>';
        const dash = document.getElementById('weather-dashboard'); if (dash && !document.getElementById('wx-area')) dash.insertAdjacentHTML('beforebegin', '<div class="wx-area" id="wx-area"></div>');
        const R = this.cfg.hazards.radiation, mon = document.getElementById('radiation-monitor');
        if (mon) mon.innerHTML = `<div class="metric-card wide"><div class="metric-label">Gale surface dose equivalent (GCR)</div>
            <div class="metric-value success" data-metric="radiation-dose">-- <span class="metric-unit">mSv/day</span></div>
            <div class="metric-trend stable" id="rad-sub">MEASURED baseline 0.67 · now modelled</div></div>`;
        const box = mon?.closest('.right-panel-section');
        if (box && !box.querySelector('.data-note')) box.insertAdjacentHTML('beforeend',
            `<div class="data-note">Baseline: MSL RAD, Hassler et al. 2014 (Science 343). The dose shown rises where the air is thinner (higher ground, low-pressure hours) and falls where it is thicker (more atmosphere = more shielding); the size of that effect is a modelled assumption. Cruise to Mars ≈ 1.8 mSv/day. Solar-particle events are <b>not</b> connected; alert bands are illustrative.</div>`);
        this.R = R;
    }
    titleEl() { return document.querySelector('#weather-dashboard')?.closest('.right-panel-section')?.querySelector('.right-panel-title'); }

    card(metric, html, sub) {
        const v = document.querySelector(`#weather-dashboard [data-metric="${metric}"]`); if (!v) return;
        v.innerHTML = html; const t = v.parentElement.querySelector('.metric-trend');
        if (t && sub !== undefined) { t.className = 'metric-trend stable'; t.removeAttribute('style'); t.textContent = sub; }
    }

    /* ---------- area under the map window: mean elevation, slope, relief from the terrain grid ---------- */
    watchMap() {
        const m = window.marsMapInstance && window.marsMapInstance.getMap(); if (!m) return;
        let to = null; m.on('moveend', () => { clearTimeout(to); to = setTimeout(() => { this.computeArea(); this.tick(); }, 120); });
        this.computeArea();
    }
    computeArea() {
        const m = window.marsMapInstance && window.marsMapInstance.getMap(), g = window.terrainGrid; this.area = null; if (!m || !g) return;
        const b = m.getBounds(), S = Math.max(b.getSouth(), g.meta.south), N = Math.min(b.getNorth(), g.meta.north), W = Math.max(b.getWest(), g.meta.west), E = Math.min(b.getEast(), g.meta.east);
        if (N <= S || E <= W) return;
        const cover = ((N - S) * (E - W)) / ((b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest()));
        if (cover < 0.25) return;                                      // view mostly outside the study grid
        const r0 = Math.max(0, Math.floor((g.meta.north - N) / g.dLat)), r1 = Math.min(g.ny - 1, Math.floor((g.meta.north - S) / g.dLat));
        const c0 = Math.max(0, Math.floor((W - g.meta.west) / g.dLon)), c1 = Math.min(g.nx - 1, Math.floor((E - g.meta.west) / g.dLon));
        const step = Math.max(1, Math.ceil(Math.sqrt(((r1 - r0 + 1) * (c1 - c0 + 1)) / 2000)));
        let se = 0, ss = 0, k = 0, mn = Infinity, mx = -Infinity;
        for (let r = r0; r <= r1; r += step) for (let c = c0; c <= c1; c += step) {
            const i = r * g.nx + c; if (g.unknown[i]) continue;
            se += g.elev[i]; ss += g.slope[i]; k++; mn = Math.min(mn, g.elev[i]); mx = Math.max(mx, g.elev[i]);
        }
        if (k) this.area = { elev: se / k, slope: ss / k, relief: mx - mn, cover };
    }

    tick() {
        const B = this.base, A = this.area, t = this.lmst(this.simSeconds()), n = k => Math.sin(Date.now() / (900 + k * 370) + k) * 0.5;
        const zref = B.source === 'live' ? -3765 : -4500;               // elevation the reference readings belong to (m)
        const dz = A ? A.elev - zref : 0;
        const dT = -2.5 * dz / 1000;                                     // cooler with altitude (assumed 2.5 K/km)
        const Pm = B.pm * Math.exp(-dz / 10800);                         // pressure falls with altitude (scale height ~10.8 km)
        const wf = A ? 1 + 0.05 * A.slope + 0.10 * Math.max(0, dz / 1000) : 1;   // steeper / higher terrain -> windier (assumed)
        const tmin = 5, tmax = 13.5; let f;
        if (t >= tmin && t <= tmax) f = 0.5 - 0.5 * Math.cos(Math.PI * (t - tmin) / (tmax - tmin));
        else { const u = (t > tmax ? t - tmax : t + 24 - tmax) / (24 - (tmax - tmin)); f = 0.5 + 0.5 * Math.cos(Math.PI * u); }
        const lo = B.min + dT, hi = B.max + dT, T = lo + (hi - lo) * f + n(1) * 1.4;
        const amp = 0.06 * Pm, P = Pm - amp * Math.cos(2 * Math.PI * (t - 15) / 24) + n(2) * 4;
        const sh = Math.max(0, Math.sin(Math.PI * (t - 8) / 12)), W = Math.max(0, (B.wind !== null ? B.wind * (0.6 + 0.8 * sh) : 2.5 + 6 * sh) * wf + n(3) * 2);
        const sun = Math.max(0, Math.cos(2 * Math.PI * (t - 12.5) / 24)), peak = (B.uv || 'HIGH').toUpperCase();
        const uv = sun <= 0.02 ? 'NIGHT' : sun < 0.3 ? 'LOW' : sun < 0.65 ? 'MODERATE' : peak;
        const D = this.cfg.weather.current.radiation.value * (1 - 0.5 * ((P - B.pm) / B.pm)) + n(4) * 0.03;   // thinner air -> more GCR dose
        const hh = String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.floor((t % 1) * 60)).padStart(2, '0');
        const live = B.source === 'live', where = A ? `${Math.round(A.elev).toLocaleString()} m` : 'ref. elevation';
        this.card('temperature', `${T.toFixed(1)}<span class="metric-unit">°C</span>`, `today ${Math.round(lo)}…${Math.round(hi)} °C at ${where}`);
        this.card('pressure', `${Math.round(P)}<span class="metric-unit"> Pa</span>`, `mean ${Math.round(Pm)} Pa at ${where}`);
        this.card('wind-speed', `${W.toFixed(1)}<span class="metric-unit"> m/s</span>`, A ? `terrain factor ×${wf.toFixed(2)} (slope ${A.slope.toFixed(0)}°)` : 'modelled');
        this.card('uv-index', uv, `local solar time ${hh}${B.opacity ? ' · sky ' + B.opacity : ''}`);
        let band = 'nominal'; for (const kk of ['nominal', 'elevated', 'high', 'extreme']) { if (D <= this.R[kk].max) { band = kk; break; } }
        const dv = document.querySelector('#radiation-monitor [data-metric="radiation-dose"]');
        if (dv) { dv.innerHTML = `${D.toFixed(2)} <span class="metric-unit">mSv/day</span>`; dv.className = 'metric-value ' + (band === 'nominal' ? 'success' : band === 'elevated' ? 'warning' : 'danger'); }
        const rs = document.getElementById('rad-sub'); if (rs) rs.textContent = `MEASURED baseline 0.67 at ${(-4500).toLocaleString()} m · ${this.R[band].label}`;
        const bar = document.getElementById('radiation-bar'); if (bar) bar.style.width = Math.min(100, D / 3 * 100) + '%';
        const al = document.getElementById('wx-area');
        if (al) al.innerHTML = A ? `Readings for the <b>area in view</b>: mean elevation <b>${Math.round(A.elev).toLocaleString()} m</b> · avg slope <b>${A.slope.toFixed(1)}°</b> · relief <b>${Math.round(A.relief)} m</b>`
                                  : 'Map view is mostly <b>outside the Gale study grid</b> — showing reference conditions. Zoom into Gale Crater for area readings.';
        this.cur = { temperature: T, pressure: P, wind: W, uv, radiation: D, lmst: t, area: A };
    }

    /* ---------- LIVE Curiosity REMS daily range (via CAB-INTA / MAAS2). Falls back silently to typical values. ---------- */
    async fetchLive() {
        const urls = ['https://api.maas2.apollorion.com/', 'https://cab.inta-csic.es/rems/wp-content/plugins/marsweather-widget/api.php'];
        for (const u of urls) {
            try {
                const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
                const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(tm);
                if (!r.ok) continue;
                const rep = this.parse(await r.json());
                if (rep) { this.useLive(rep); return; }
            } catch (e) { /* try next source */ }
        }
        console.info('[MarsPath] live REMS feed unavailable - using typical Gale values');
    }
    num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
    parse(j) {
        let d = j;
        if (j && Array.isArray(j.soles)) d = j.soles.slice().sort((a, b) => (+b.sol || 0) - (+a.sol || 0)).find(x => this.num(x.min_temp) !== null && this.num(x.max_temp) !== null);
        if (!d) return null;
        const min = this.num(d.min_temp), max = this.num(d.max_temp), pr = this.num(d.pressure);
        if (min === null || max === null || min > max || min < -150 || max > 50) return null;
        if (pr !== null && (pr < 300 || pr > 1200)) return null;
        return { sol: d.sol, date: d.terrestrial_date, min, max, pressure: pr, wind: this.num(d.wind_speed),
                 uv: (d.local_uv_irradiance_index || '').toString().replace(/_/g, ' '), opacity: d.atmo_opacity || '' };
    }
    useLive(L) {
        this.base = { source: 'live', min: L.min, max: L.max, pm: L.pressure !== null ? L.pressure : this.base.pm, wind: L.wind, uv: L.uv || this.base.uv, opacity: L.opacity };
        const b = document.getElementById('wx-badge'); if (b) { b.style.setProperty('--pc', '#00E676'); b.textContent = `REMS SOL ${L.sol} · CYCLE MODELLED`; }
        const box = document.querySelector('#weather-dashboard')?.closest('.right-panel-section');
        const age = L.date ? Math.round((Date.now() - new Date(L.date).getTime()) / 86400000) : null;
        if (box) { let n = box.querySelector('.wx-note'); if (!n) { n = document.createElement('div'); n.className = 'data-note wx-note'; box.appendChild(n); }
            n.innerHTML = `Daily range & mean pressure: Curiosity REMS report (CAB-INTA / MAAS2), sol ${L.sol}${L.date ? ', ' + L.date : ''}${age !== null && age >= 0 ? ' (' + age + ' d old)' : ''}. Values follow the map area (altitude, slope) and a modelled daily cycle at Gale local solar time (runs with the HUD clock). Not real-time.`; }
        this.tick();
    }
    getCurrentWeather() { return this.cur; }
}
window.WeatherDashboard = WeatherDashboard;
