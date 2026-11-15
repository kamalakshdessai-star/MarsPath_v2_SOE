/**
 * MarsPath - RoutePlanner (UI + A* integration)
 * Replaces the first draft's straight-line "routes". Waypoints are joined by A* legs over the terrain
 * grid; three route modes (shortest / lower terrain cost / cautious) can be drawn side by side.
 */
class RoutePlanner {
    constructor(marsMap, terrain) {
        this.marsMap = marsMap; this.map = marsMap.getMap(); this.terrain = terrain;
        this.cfg = window.MarsPathConfig; this.PF = window.MarsPathfinding;
        this.waypoints = [];          // {lat,lng,name,targetId?,stop(min)}
        this.mode = 'balanced'; this.compare = false; this.travel = this.cfg.mobility.default; this.crew = 2; this.roverSpeed = 12; this.o2Cap = 5; this.batCap = 40; this.res = null; this.depMarker = null;
        this.planning = false; this.results = {};
        this.markers = []; this.lines = []; this.charts = [];
        this.injectControls(); this.bind(); this.initCharts(); this.render();
    }

    /* ---------- travel mode (on foot / rover): same planner, different speed, slope limits, budget ---------- */
    profile() { return this.cfg.mobility.profiles[this.travel]; }
    planner() { return this.cfg.effectivePlanner(this.travel, this.travel === 'rover' ? { speed: this.roverSpeed } : null); }
    refreshModeOptions() { const sel = document.getElementById('route-mode'); if (sel) sel.innerHTML = this.modeOptions(); }
    resources(r) { if (!r || !r.ok || !window.ResourceModel) { this.res = null; return null; } this.res = window.ResourceModel.compute(r, this.waypoints, this.travel, this.profile(), { crew: this.crew, speed: this.roverSpeed, o2CapKg: this.o2Cap, batKwh: this.batCap }, this.planner(), this.cfg.suit); return this.res; }
    budget() { return this.profile().budgetMin; }
    modeOptions() { const M = this.planner().modes; return Object.entries(M).map(([k, m]) => `<option value="${k}" ${k === this.mode ? 'selected' : ''}>${m.label} (max ${m.maxSlope}°)</option>`).join(''); }
    setTravel(key) {
        this.travel = key; this.refreshModeOptions(); const ro = document.getElementById('rover-opts'); if (ro) ro.style.display = key === 'rover' ? 'block' : 'none';
        this.recompute(); const p = this.profile();
        this.notify(`Travel mode: ${p.label} — ${p.flatKmh} km/h on flat ground, ${this.fmtTime(p.budgetMin)} budget, slope limits ${Object.values(p.slopes).join('° / ')}° (prototype assumptions).`, 'info', 6500);
    }

    /* ---------- UI plumbing ---------- */
    injectControls() {
        const ctl = document.querySelector('#panel-route .route-controls'); if (!ctl) return;
        const box = document.createElement('div'); box.className = 'route-mode-box';
        box.innerHTML = `<label class="rm-label" for="travel-mode">Travel mode</label>
            <select id="travel-mode">${Object.entries(this.cfg.mobility.profiles).map(([k, p]) => `<option value="${k}" ${k === this.travel ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
            <div id="rover-opts" style="display:none;margin-top:10px">
              <label class="rm-label" for="rover-speed">Rover speed: <b id="rover-speed-val">${this.roverSpeed}</b> km/h</label>
              <input type="range" id="rover-speed" min="4" max="20" step="1" value="${this.roverSpeed}" style="width:100%">
              <label class="rm-label" for="rover-o2" style="margin-top:8px">Oxygen supply: <b id="rover-o2-val">${this.o2Cap}</b> kg</label>
              <input type="range" id="rover-o2" min="0.1" max="10" step="0.1" value="${this.o2Cap}" style="width:100%">
              <label class="rm-label" for="rover-bat" style="margin-top:8px">Battery capacity: <b id="rover-bat-val">${this.batCap}</b> kWh</label>
              <input type="range" id="rover-bat" min="5" max="100" step="5" value="${this.batCap}" style="width:100%">
              <label class="rm-label" for="rover-crew" style="margin-top:8px">Crew on board</label>
              <select id="rover-crew" style="width:100%;padding:6px;background:#0e0e16;color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:4px"><option value="1">1 person</option><option value="2" selected>2 people</option><option value="3">3 people</option></select>
            </div>
            <label class="rm-label" for="route-mode" style="margin-top:10px">Route preference</label>
            <select id="route-mode">${this.modeOptions()}</select>
            <label class="rm-check"><input type="checkbox" id="route-compare"> Compare all three modes</label>
            <button class="route-btn" id="btn-science-route" title="Pick science stops that fit inside the time budget of the selected travel mode" style="width:100%;margin-top:8px"><i class="fa-solid fa-flask"></i> SCIENCE ROUTE (auto-pick stops)</button>`;
        ctl.insertAdjacentElement('afterend', box);
        const sum = document.querySelector('#route-total-distance'); const anchor = sum && sum.closest('.panel-section');
        const rep = document.createElement('div'); rep.id = 'route-report'; rep.className = 'panel-section';
        (anchor || ctl.parentElement).insertAdjacentElement('afterend', rep);
    }

    bind() {
        const $ = id => document.getElementById(id);
        $('btn-add-waypoint')?.addEventListener('click', () => this.togglePlanning());
        $('btn-clear-route')?.addEventListener('click', () => this.clearRoute());
        $('btn-auto-route')?.addEventListener('click', () => this.autoShortest());
        $('btn-science-route')?.addEventListener('click', () => this.scienceRoute());
        $('travel-mode')?.addEventListener('change', e => this.setTravel(e.target.value));
        $('rover-speed')?.addEventListener('input', e => { $('rover-speed-val').textContent = e.target.value; });
        $('rover-speed')?.addEventListener('change', e => { this.roverSpeed = +e.target.value; this.refreshModeOptions(); this.recompute(); });
        $('rover-o2')?.addEventListener('input', e => { $('rover-o2-val').textContent = e.target.value; });
        $('rover-o2')?.addEventListener('change', e => { this.o2Cap = +e.target.value; this.render(); });
        $('rover-bat')?.addEventListener('input', e => { $('rover-bat-val').textContent = e.target.value; });
        $('rover-bat')?.addEventListener('change', e => { this.batCap = +e.target.value; this.render(); });
        $('rover-crew')?.addEventListener('change', e => { this.crew = +e.target.value; this.render(); });
        $('route-mode')?.addEventListener('change', e => { this.mode = e.target.value; this.recompute(); });
        $('route-compare')?.addEventListener('change', e => { this.compare = e.target.checked; this.recompute(); });
        document.addEventListener('marsmap:click', e => { if (this.planning) this.addWaypoint(e.detail.lat, e.detail.lng); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.planning) this.togglePlanning(); });
        $('waypoint-list')?.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]'); if (!b) return;
            const i = +b.closest('.waypoint-item').dataset.i, w = this.waypoints[i];
            if (b.dataset.act === 'rm') this.removeWaypoint(i); else if (b.dataset.act === 'go') this.marsMap.flyTo(w.lat, w.lng, 12);
        });
    }

    notify(msg, type = 'warning') { window.uiManager?.showNotification(msg, type, 5000); }

    togglePlanning(force) {
        this.planning = force !== undefined ? force : !this.planning;
        const b = document.getElementById('btn-add-waypoint');
        if (b) { b.classList.toggle('active', this.planning); b.innerHTML = this.planning ? '<i class="fa-solid fa-stop"></i> Stop adding' : '<i class="fa-solid fa-location-dot"></i> Add Waypoint'; }
        document.getElementById('mars-map').style.cursor = this.planning ? 'crosshair' : '';
        if (this.planning) this.notify('Click the map to add waypoints (first = start). Press Esc to stop.', 'info');
    }

    /* ---------- waypoints ---------- */
    addWaypoint(lat, lng, name = null, extra = {}) {
        if (this.terrain && !this.terrain.contains(lat, lng)) { this.notify('That point is outside the terrain-grid study area; route planning is limited to the shaded region.'); return null; }
        const w = Object.assign({ lat, lng, name: name || `Waypoint ${this.waypoints.length + 1}`, stop: 0 }, extra);
        this.waypoints.push(w);
        if (this.autoPending && this.waypoints.length >= 2) { this.autoPending = false; this.togglePlanning(false); this.notify('Shortest route calculated between your start and destination.', 'success'); }
        this.recompute(); return w;
    }
    addScienceTarget(id) {
        const t = this.cfg.scienceTargets.find(x => x.id === id); if (!t) return;
        this.map.closePopup(); return this.addWaypoint(t.lat, t.lng, t.name, { targetId: t.id, stop: t.estimatedTime });
    }
    removeWaypoint(i) { this.waypoints.splice(i, 1); this.recompute(); }
    clearRoute() { this.waypoints = []; this.results = {}; this.togglePlanning(false); this.recompute(); }

    /* ---------- planning ---------- */
    recompute() {
        this.results = {};
        if (this.waypoints.length >= 2 && this.terrain) {
            const pts = this.waypoints.map(w => [w.lat, w.lng]);
            const modes = this.compare ? Object.keys(this.planner().modes) : [this.mode];
            for (const m of modes) this.results[m] = this.PF.planRoute(this.terrain, pts, m, this.planner());
            const cur = this.results[this.mode];
            if (cur && !cur.ok) this.notify(cur.reason);
        }
        this.render();
    }

    stopMinutes() { return this.waypoints.slice(1, -1).reduce((a, w) => a + (w.stop || 0), 0); }

    render() { this.resources(this.results[this.mode]); this.drawMarkers(); this.drawLines(); this.fillSummary(); this.fillList(); this.fillReport(); this.updateCharts(); this.broadcast(); }

    drawMarkers() {
        this.markers.forEach(m => this.map.removeLayer(m)); this.markers = [];
        this.waypoints.forEach((w, i) => {
            const label = i === 0 ? 'S' : (i === this.waypoints.length - 1 ? 'E' : String(i));
            const m = L.marker([w.lat, w.lng], { draggable: true, zIndexOffset: 1000,
                icon: L.divIcon({ className: 'wp-pin', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="wp-pin-in${w.targetId ? ' sci' : ''}">${label}</div>` }) }).addTo(this.map);
            m.bindTooltip(w.name, { className: 'mars-tooltip', direction: 'top', offset: [0, -14] });
            m.on('dragend', e => { const p = e.target.getLatLng(); if (this.terrain && !this.terrain.contains(p.lat, p.lng)) { this.notify('Outside study area.'); this.render(); return; } w.lat = p.lat; w.lng = p.lng; this.recompute(); });
            this.markers.push(m);
        });
    }

    drawLines() {
        this.lines.forEach(l => this.map.removeLayer(l)); this.lines = [];
        if (this.depMarker) { this.map.removeLayer(this.depMarker); this.depMarker = null; }
        const M = this.planner().modes, dep = this.res && this.res.dep;
        Object.entries(this.results).forEach(([k, r]) => {
            if (!r.ok) return;
            const sel = k === this.mode, tip = `${M[k].label}: ${(r.summary.distanceM / 1000).toFixed(2)} km, max slope ${r.summary.maxSlope.toFixed(1)}°`;
            const style = { color: M[k].color, weight: sel ? 4 : 2.5, opacity: sel ? 0.95 : 0.75, dashArray: sel ? null : '6,6', className: 'planned-route' };
            if (sel && dep) {   // resources run out: route is mode-coloured until the failure point, red after it
                const ok = r.latlngs.slice(0, dep.index).concat([dep.latlng]), bad = [dep.latlng].concat(r.latlngs.slice(dep.index));
                this.lines.push(L.polyline(ok, style).bindTooltip(tip, { className: 'mars-tooltip', sticky: true }).addTo(this.map));
                this.lines.push(L.polyline(bad, { color: '#FF1744', weight: 5, opacity: 0.95, className: 'planned-route' }).bindTooltip(`${dep.resource} depleted - mission shortfall`, { className: 'mars-tooltip', sticky: true }).addTo(this.map));
                return;
            }
            const l = L.polyline(r.latlngs, style).bindTooltip(tip, { className: 'mars-tooltip', sticky: true }).addTo(this.map);
            if (sel) l.bringToFront(); this.lines.push(l);
        });
        if (dep) {
            this.depMarker = L.marker(dep.latlng, { zIndexOffset: 2000, icon: L.divIcon({ className: 'dep-pin', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="dep-pin-in">!</div>' }) }).addTo(this.map)
                .bindTooltip(`⚠ ${dep.resource} runs out here — ${(dep.distM / 1000).toFixed(1)} km (${(dep.frac * 100).toFixed(0)}% of route)${dep.atStop ? ', while on site' : ''}`, { className: 'mars-tooltip', direction: 'top', offset: [0, -16] });
        }
    }

    fmtTime(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${h}:${String(m).padStart(2, '0')}`; }

    fillSummary() {
        const r = this.results[this.mode], ok = r && r.ok, set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
        const u = t => `<span class="metric-unit">${t}</span>`;
        if (!ok) { set('route-total-distance', `0.00 ${u('km')}`); set('route-est-time', `0:00 ${u('hrs')}`); set('route-elev-delta', `+0 ${u('m')}`); }
        else {
            const s = r.summary, total = s.minutes + this.stopMinutes();
            set('route-total-distance', `${(s.distanceM / 1000).toFixed(2)} ${u('km')}`);
            set('route-est-time', `${this.fmtTime(total)} ${u('hrs')}`);
            set('route-elev-delta', `+${Math.round(s.gain)} / −${Math.round(s.loss)} ${u('m')}`);
            const t = document.getElementById('route-est-time'); if (t) t.classList.toggle('danger', total > this.budget());
        }
        set('route-wp-count', String(this.waypoints.length));
        const sb = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        sb('sb-distance', ok ? `${(r.summary.distanceM / 1000).toFixed(2)} km planned` : 'no route');
        sb('sb-eva-time', ok ? `${this.fmtTime(r.summary.minutes + this.stopMinutes())} planned (budget ${this.fmtTime(this.budget())})` : '—');
    }

    fillList() {
        const el = document.getElementById('waypoint-list'); if (!el) return;
        if (!this.waypoints.length) { el.innerHTML = '<p class="empty-state">No waypoints. Click “Add Waypoint”, then click the map — or add a science target from its popup, or use Auto-route.</p>'; return; }
        const r = this.results[this.mode], ok = r && r.ok;
        let prevEnd = 0;
        el.innerHTML = this.waypoints.map((w, i) => {
            let dist = i === 0 ? 'START' : '—';
            if (ok && i > 0) { const e = r.legEnds[i - 1], d = r.summary.profile[e].d - r.summary.profile[prevEnd].d; prevEnd = e; dist = (d / 1000).toFixed(2) + ' km'; }
            const label = i === 0 ? 'S' : (i === this.waypoints.length - 1 ? 'E' : i);
            const z = this.marsMap.estimateElevation(w.lat, w.lng);
            return `<div class="waypoint-item ${w.targetId ? 'science' : ''}" data-i="${i}">
                <div class="waypoint-marker">${label}</div>
                <div class="waypoint-details"><div class="waypoint-name">${w.name}</div>
                <div class="waypoint-coords">${w.lat.toFixed(4)}° / ${w.lng.toFixed(4)}°${z !== null ? ' · ' + z + ' m' : ''}${w.stop ? ' · ' + w.stop + ' min stop' : ''}</div></div>
                <div class="waypoint-distance">${dist}</div>
                <div class="waypoint-actions"><button data-act="go" title="Fly to"><i class="fa-solid fa-crosshairs"></i></button><button data-act="rm" title="Remove"><i class="fa-solid fa-xmark"></i></button></div></div>`;
        }).join('');
    }

    fillReport() {
        const el = document.getElementById('route-report'); if (!el) return;
        const M = this.planner().modes, r = this.results[this.mode];
        if (!r) { this.res = null; el.innerHTML = '<div class="panel-section-title">Route Report</div><p class="empty-state">Add two or more waypoints to plan a route.</p>'; return; }
        if (!r.ok) { el.innerHTML = `<div class="panel-section-title">Route Report</div><p class="rr-bad">⛔ ${r.reason}</p>`; return; }
        const s = r.summary, total = s.minutes + this.stopMinutes(), over = total > this.budget();
        let html = `<div class="panel-section-title">Route Report — ${M[this.mode].label}</div>
            <table class="rr-table">
              <tr><td>Distance (ground / 3-D)</td><td>${(s.distanceM / 1000).toFixed(2)} / ${(s.distance3dM / 1000).toFixed(2)} km</td></tr>
              <tr><td>Slope: max · p95 · mean</td><td>${s.maxSlope.toFixed(1)}° · ${s.p95Slope.toFixed(1)}° · ${s.meanSlope.toFixed(1)}°</td></tr>
              <tr><td>Travel + science stops</td><td>${this.fmtTime(s.minutes)} + ${this.fmtTime(this.stopMinutes())} = <b class="${over ? 'rr-bad' : ''}">${this.fmtTime(total)}</b></td></tr>
              <tr><td>Terrain cost (A*)</td><td>${(s.cost / 1000).toFixed(2)}k  (${(s.cost / s.distanceM).toFixed(2)}× distance)</td></tr>
              <tr><td>Cells searched</td><td>${r.expanded.toLocaleString()}</td></tr></table>`;
        if (this.compare) {
            html += `<table class="rr-table rr-cmp"><tr><th>Mode</th><th>km</th><th>max°</th><th>p95°</th><th>cost×</th></tr>` +
                Object.entries(this.results).map(([k, x]) => x.ok ? `<tr class="${k === this.mode ? 'sel' : ''}"><td><i style="background:${M[k].color}"></i>${M[k].label}</td><td>${(x.summary.distanceM / 1000).toFixed(1)}</td><td>${x.summary.maxSlope.toFixed(1)}</td><td>${x.summary.p95Slope.toFixed(1)}</td><td>${(x.summary.cost / x.summary.distanceM).toFixed(2)}</td></tr>` : `<tr><td>${M[k].label}</td><td colspan="4" class="rr-bad">no route</td></tr>`).join('') + '</table>';
        }
        const res = this.resources(r); if (res) { html += `<div class="panel-section-title" style="margin-top:10px">${res.type === 'rover' ? 'Rover resources' : 'Suit consumables'} <span class="prov-badge" style="--pc:#FF9100">ILLUSTRATIVE</span></div><table class="rr-table">${window.ResourceModel.rows(res).map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('')}</table>`; }
        const w = [...s.warnings]; if (res) w.push(...res.warnings); if (over) w.unshift(`Plan exceeds the ${this.fmtTime(this.budget())} ${this.profile().short} budget (assumed) — shorten, split across sols, or use a rover.`);
        if (r.snapped.some(Boolean)) w.push('A waypoint was moved to the nearest traversable cell.');
        w.push(this.travel === 'rover' ? 'Resource figures use prototype consumption rates; comms windows and crew fatigue are NOT modelled.' : 'Suit consumables, comms windows and crew fatigue are NOT modelled.');
        html += `<ul class="rr-warn">${w.map(x => `<li>${x}</li>`).join('')}</ul>`;
        el.innerHTML = html;
    }

    broadcast() {
        const r = this.results[this.mode];
        document.dispatchEvent(new CustomEvent('route:updated', { detail: { waypoints: this.waypoints, result: r && r.ok ? r : null, distanceKm: r && r.ok ? r.summary.distanceM / 1000 : 0 } }));
    }

    /* ---------- elevation profile charts (left Route tab + right panel) ---------- */
    initCharts() {
        if (typeof Chart === 'undefined') return;
        ['elevation-profile-chart', 'right-elevation-chart'].forEach(id => {
            const cv = document.getElementById(id); if (!cv) return;
            this.charts.push(new Chart(cv, { type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#E53935', backgroundColor: 'rgba(229,57,53,.12)', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2 }] },
                options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false },
                    tooltip: { callbacks: { title: i => `${i[0].label} km`, label: c => `${Math.round(c.parsed.y)} m` } } },
                    scales: { x: { title: { display: true, text: 'Distance (km)', color: '#9E9E9E' }, ticks: { color: '#9E9E9E', maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,.05)' } },
                              y: { title: { display: true, text: 'Elevation (m)', color: '#9E9E9E' }, ticks: { color: '#9E9E9E' }, grid: { color: 'rgba(255,255,255,.05)' } } } } }));
        });
    }
    updateCharts() {
        const r = this.results[this.mode]; let labels = [], data = [];
        if (r && r.ok) { const p = r.summary.profile, step = Math.max(1, Math.floor(p.length / 200)); for (let i = 0; i < p.length; i += step) { labels.push((p[i].d / 1000).toFixed(2)); data.push(p[i].z); } }
        this.charts.forEach(c => { c.data.labels = labels; c.data.datasets[0].data = data; c.update(); });
    }

    /* ---------- AUTO = shortest path (start + destination you choose) ---------- */
    autoShortest() {
        this.mode = 'shortest'; this.compare = false;
        const sel = document.getElementById('route-mode'); if (sel) sel.value = 'shortest';
        const cmp = document.getElementById('route-compare'); if (cmp) cmp.checked = false;
        if (this.waypoints.length < 2) {
            this.autoPending = true; this.togglePlanning(true);
            this.notify('AUTO: click a START point, then a DESTINATION on the map. The shortest route is calculated automatically.', 'info'); return;
        }
        const saved = this.optimizeOrder(); this.recompute();
        const r = this.results.shortest;
        if (r && r.ok) this.notify('Shortest route: ' + (r.summary.distanceM / 1000).toFixed(2) + ' km' + (saved > 0 ? ' (stop order optimised, saved ' + (saved / 1000).toFixed(2) + ' km)' : '') + '.', 'success');
    }
    /* Keep first = start and last = destination; reorder middle stops to minimise total A* distance. Returns metres saved. */
    optimizeOrder() {
        const W = this.waypoints, n = W.length; if (n < 4 || !this.terrain) return 0;
        const P = W.map(w => [w.lat, w.lng]), D = Array.from({ length: n }, () => Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const r = this.PF.planRoute(this.terrain, [P[i], P[j]], 'shortest', this.planner());
            D[i][j] = D[j][i] = r.ok ? r.summary.distanceM : 1e12;
        }
        const mids = []; for (let i = 1; i < n - 1; i++) mids.push(i);
        const total = order => { let t = D[0][order[0]]; for (let k = 1; k < order.length; k++) t += D[order[k - 1]][order[k]]; return t + D[order[order.length - 1]][n - 1]; };
        const before = total(mids); let best = mids.slice(), bt = before;
        if (mids.length <= 7) {
            const perm = (arr, cur) => { if (!arr.length) { const t = total(cur); if (t < bt) { bt = t; best = cur.slice(); } return; } arr.forEach((v, i) => perm(arr.filter((_, k) => k !== i), cur.concat(v))); };
            perm(mids, []);
        } else { best = []; const rem = mids.slice(); let c = 0; while (rem.length) { rem.sort((a, b) => D[c][a] - D[c][b]); c = rem.shift(); best.push(c); } bt = total(best); }
        this.waypoints = [W[0], ...best.map(i => W[i]), W[n - 1]];
        return Math.max(0, before - bt);
    }

    /* ---------- SCIENCE ROUTE (previous auto behaviour: pick stops that fit the EVA budget) ---------- */
    scienceRoute() {
        if (!this.terrain) return;
        const C = this.cfg, T = C.scienceTargets, budget = this.budget(), rank = { critical: 0, high: 1, medium: 2, low: 3 };
        const dist = (a, b) => this.marsMap.calculateDistance(a.lat, a.lng, b.lat, b.lng);
        // Forward base = shelter closest (on average) to the targets
        const base = C.shelters.slice().sort((a, b) => T.reduce((s, t) => s + dist(a, t), 0) - T.reduce((s, t) => s + dist(b, t), 0))[0];
        const bw = { lat: base.lat, lng: base.lng, name: base.name, stop: 0 };
        const order = list => { const out = [], rem = list.slice(); let cur = bw; while (rem.length) { rem.sort((x, y) => dist(cur, x) - dist(cur, y)); cur = rem.shift(); out.push(cur); } return out; };
        const build = list => [bw, ...order(list).map(t => ({ lat: t.lat, lng: t.lng, name: t.name, targetId: t.id, stop: t.estimatedTime })), Object.assign({}, bw, { name: base.name + ' (return)' })];
        let chosen = [];
        for (const t of T.slice().sort((a, b) => rank[a.priority] - rank[b.priority] || dist(bw, a) - dist(bw, b))) {
            const trial = build([...chosen, t]);
            const r = this.PF.planRoute(this.terrain, trial.map(w => [w.lat, w.lng]), this.mode, this.planner());
            if (r.ok && r.summary.minutes + trial.slice(1, -1).reduce((a, w) => a + w.stop, 0) <= budget) chosen.push(t);
        }
        if (!chosen.length) { this.notify('No science target fits inside the time budget from any base - try the rover travel mode or split the work across sols.'); return; }
        this.waypoints = build(chosen); this.togglePlanning(false); this.recompute();
        if (this.lines.length) this.map.fitBounds(L.featureGroup(this.lines).getBounds().pad(0.15));
        this.notify(`Science route: ${chosen.length} science stop(s) from ${base.name}, within the ${this.fmtTime(budget)} ${this.profile().short} budget.`, 'success');
    }
    getRouteData() { return { waypoints: this.waypoints, results: this.results }; }
}
RoutePlanner.prototype.autoRoute = RoutePlanner.prototype.scienceRoute;
window.RoutePlanner = RoutePlanner;
