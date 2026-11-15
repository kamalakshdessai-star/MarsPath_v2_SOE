/**
 * MarsPath - HUD overlay (helmet-visor view). Drives the HTML HUD elements.
 * "Walk route" simulation: a virtual astronaut follows the planned A* route, so the HUD shows
 * heading, elevation, speed, distance to next waypoint and slope warnings FROM THE PLAN.
 * O2 / battery readouts are ILLUSTRATIVE linear drains over the assumed EVA budget.
 */
class HUDOverlay {
    constructor(marsMap) {
        this.marsMap = marsMap; this.map = marsMap.getMap(); this.cfg = window.MarsPathConfig;
        this.active = false; this.route = null; this.pos = 0; this.raf = null; this.last = 0; this.dot = null; this.warnUntil = 0;
        document.getElementById('hud-toggle-btn')?.addEventListener('click', () => this.toggle());
        document.addEventListener('route:updated', e => { this.route = e.detail.result; this.pos = 0; this.dist = 0; this.i = 0; this.done = false; this.elapsed = 0; this.setClock(0); this.clearProgress(); this.depWarned = false; if (this.active) this.refreshIdle(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.active) this.toggle(); });
    }
    setClock(sec) { const f = n => String(Math.floor(n)).padStart(2, '0'); const e = document.getElementById('mission-clock'); if (e) e.textContent = `${f(sec / 3600)}:${f((sec / 60) % 60)}:${f(sec % 60)}`; }
    $(id) { return document.getElementById(id); }
    set(id, t) { const e = this.$(id); if (e) e.textContent = t; }

    toggle() {
        this.active = !this.active;
        this.$('hud-overlay')?.classList.toggle('active', this.active);
        document.body.classList.toggle('hud-on', this.active); setTimeout(() => this.map.invalidateSize(), 50);
        this.$('hud-toggle-btn')?.classList.toggle('active', this.active);
        this.$('hud-toggle-btn')?.setAttribute('aria-pressed', this.active);
        if (this.active) { this.last = performance.now(); this.pos = 0; this.dist = 0; this.i = 0; this.done = false; this.elapsed = 0; this.setClock(0); this.clearProgress(); this.depWarned = false; this.raf = requestAnimationFrame(t => this.tick(t)); if (!this.route) this.warn('NO ROUTE — plan one in the ROUTE tab'); }
        else { cancelAnimationFrame(this.raf); if (this.dot) { this.map.removeLayer(this.dot); this.dot = null; } }
    }

    bearing(a, b) {
        const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
        const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }
    card(deg) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]; }
    warn(msg, ms = 4000) { const w = this.$('hud-warning'); this.set('hud-warning-text', msg); w?.classList.add('visible'); this.warnUntil = performance.now() + ms; }

    /* O2 / battery along the route; values keep counting below 0; completed path green while resources last, red after */
    clearProgress() { ['pathGreen', 'pathRed'].forEach(k => { if (this[k]) { this.map.removeLayer(this[k]); this[k] = null; } }); }
    resources(i, f, here, cells) {
        const RS = window.routePlanner && window.routePlanner.res; if (!RS) return;
        const v = window.ResourceModel.at(RS, i, f), dep = RS.dep, cur = i + f;
        const setR = (id, val) => { const e = this.$(id); if (!e) return; e.textContent = Math.round(val) + '%'; e.classList.toggle('neg', val <= 0); };
        setR('hud-o2', v.o2); setR('hud-battery', v.bat);
        const depKey = dep ? (dep.index - 1 + dep.f) : Infinity, depleted = dep && cur >= depKey;
        const upto = Math.min(cells.length, i + 1);
        const green = depleted ? cells.slice(0, dep.index).concat([dep.latlng]) : cells.slice(0, upto).concat([here]);
        const red = depleted ? [dep.latlng].concat(cells.slice(dep.index, upto), [here]) : null;
        if (!this.pathGreen) this.pathGreen = L.polyline(green, { color: '#00E676', weight: 6, opacity: 0.95, interactive: false }).addTo(this.map); else this.pathGreen.setLatLngs(green);
        if (red) { if (!this.pathRed) this.pathRed = L.polyline(red, { color: '#FF1744', weight: 6, opacity: 0.95, interactive: false }).addTo(this.map); else this.pathRed.setLatLngs(red); }
        if (depleted && !this.depWarned) { this.depWarned = true; this.warn(`${dep.resource.toUpperCase()} DEPLETED - MISSION SHORTFALL`, 7000); }
    }
    refreshIdle() { if (!this.route) { this.set('hud-next-wp', '—'); this.set('hud-wp-dist', 'no route'); } }

    tick(now) {
        if (!this.active) return;
        const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
        const r = this.route;
        if (r) {
            const p = r.summary.profile, cells = r.latlngs, total = p[p.length - 1].d;
            const sm = (window.routePlanner ? window.routePlanner.planner() : this.cfg.planner).speedModel, TL = 120;          // time-lapse: 120x real time
            this.i = this.i || 0; while (this.i < p.length - 2 && p[this.i + 1].d <= this.dist) this.i++;
            const cur = p[this.i], vNow = sm.flatKmh * Math.max(sm.minFactor, 1 - cur.slope / sm.slopeDegAtMin);
            this.dist = Math.min(total, (this.dist || 0) + (vNow / 3.6) * TL * dt);
            if (!this.done) { this.elapsed = (this.elapsed || 0) + dt * TL; this.setClock(this.elapsed); }
            if (this.dist >= total && !this.done) { this.done = true; this.warn('DESTINATION REACHED', 6000); }
            const i = this.i, f = Math.min(1, Math.max(0, (this.dist - p[i].d) / Math.max(1e-6, p[i + 1].d - p[i].d)));
            const here = [cells[i][0] + (cells[i + 1][0] - cells[i][0]) * f, cells[i][1] + (cells[i + 1][1] - cells[i][1]) * f];
            const ahead = cells[Math.min(cells.length - 1, i + 3)], seg = { d: this.dist, z: cur.z + (p[i + 1].z - cur.z) * f, slope: p[i + 1].slope };
            if (!this.dot) this.dot = L.circleMarker(here, { radius: 6, color: '#fff', weight: 2, fillColor: '#E53935', fillOpacity: 1 }).addTo(this.map);
            this.dot.setLatLng(here);
            const hd = this.bearing(here, ahead); this.pos = i;
            this.set('hud-heading', `${this.card(hd)} ${Math.round(hd)}°`);
            this.set('hud-elevation', `${Math.round(seg.z).toLocaleString()}m`);
            const v = vNow;
            const sp = this.$('hud-speed'); if (sp) sp.innerHTML = `${v.toFixed(1)}<span style="font-size:12px;"> km/h</span>`;
            // next waypoint ahead of current position
            const wps = window.routePlanner?.waypoints || []; const ends = r.legEnds || [];
            let k = ends.findIndex(e => e > i + 0); if (k < 0) k = ends.length - 1;
            const nextIdx = ends[k] ?? cells.length - 1, remain = (p[nextIdx].d - seg.d) / 1000;
            this.set('hud-next-wp', wps[k + 1]?.name || 'END'); this.set('hud-wp-dist', `${remain.toFixed(2)} km`);
            const frac = total ? seg.d / total : 0;                // illustrative consumables
            this.resources(i, f, here, cells);
            if (seg.slope > 15 && now > this.warnUntil) this.warn(`STEEP GRADE ${seg.slope.toFixed(0)}° — REDUCE PACE`);
            if (!this.map.getBounds().contains(here)) this.map.panTo(here, { animate: false });
        }
        if (now > this.warnUntil) { this.$('hud-warning')?.classList.remove('visible'); }
        this.raf = requestAnimationFrame(t => this.tick(t));
    }
}
window.HUDOverlay = HUDOverlay;
