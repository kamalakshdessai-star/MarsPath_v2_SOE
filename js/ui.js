/** MarsPath - UIManager: tabs, sidebars, notifications, map tools, cursor-driven info panels. */
class UIManager {
    constructor() {
        this.cfg = window.MarsPathConfig;
        this.bindTabs(); this.bindSidebars(); this.bindTools(); this.bindKeys(); this.startClock(); this.bindCursorPanels();
        document.querySelectorAll('[data-metric="suit-o2"],[data-metric="battery"],[data-metric="comm-link"]').forEach(e => e.title = 'Demo value - suit telemetry is not modelled');
        document.addEventListener('marsmap:tilefail', () => this.showNotification('NASA tile server unreachable (offline or blocked?). Terrain, slope and route tools still work.', 'warning', 9000), { once: true });
    }

    /* tabs (HTML: .panel-tab[data-panel] <-> #panel-<name>.panel-content) */
    bindTabs() { document.querySelectorAll('.panel-tab').forEach(t => t.addEventListener('click', () => this.switchTab(t.dataset.panel))); }
    switchTab(name) {
        document.querySelectorAll('.panel-tab').forEach(t => { const on = t.dataset.panel === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
        document.querySelectorAll('.panel-content').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    }

    bindSidebars() {
        const wire = (btnId, panelId, openIcon) => document.getElementById(btnId)?.addEventListener('click', () => {
            document.getElementById(panelId).classList.toggle('collapsed');
            setTimeout(() => window.marsMapInstance?.getMap().invalidateSize(), 320);
        });
        wire('left-sidebar-toggle', 'left-sidebar'); wire('right-panel-toggle', 'right-panel');
    }

    /* map toolbar: pan / select / ruler / area / pin / camera */
    bindTools() {
        this.tool = 'select'; this.pts = []; this.mLayers = []; this.mDone = false;
        document.querySelectorAll('.map-tool-btn').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.tool === 'screenshot') return this.capture();
            this.setTool(b.dataset.tool);
        }));
        document.addEventListener('marsmap:click', e => this.onToolClick(e.detail));
        document.addEventListener('marsmap:dblclick', () => { if (this.isDraw()) { const P = this.pts; while (P.length > 1 && P[P.length - 1][0] === P[P.length - 2][0] && P[P.length - 1][1] === P[P.length - 2][1]) P.pop(); this.finishDraw(); } });
        document.addEventListener('keydown', e => { if (e.key === 'Enter' && this.isDraw()) this.finishDraw(); if (e.key === 'Escape') { this.clearMeasure(); if (this.tool !== 'select') this.setTool('select'); } });
    }
    isDraw() { return this.tool === 'measure' || this.tool === 'area'; }
    setTool(t) {
        this.tool = t; this.clearMeasure();
        document.querySelectorAll('.map-tool-btn').forEach(x => x.classList.toggle('active', x.dataset.tool === t));
        const m = window.marsMapInstance?.getMap();
        document.getElementById('mars-map').style.cursor = (t === 'pan' || t === 'select') ? '' : 'crosshair';
        if (m) this.isDraw() ? m.doubleClickZoom.disable() : m.doubleClickZoom.enable();
        if (t !== 'select' && t !== 'pan') window.routePlanner?.togglePlanning(false);
        if (t === 'measure') this.showNotification('Ruler: click points along the path. Double-click or press Enter to finish.', 'info', 5000);
        if (t === 'area') this.showNotification('Area: click 3 or more corners. Double-click or press Enter to finish.', 'info', 5000);
        if (t === 'pin') this.showNotification('Pin: click the map to drop a pin.', 'info', 3000);
    }
    onToolClick({ lat, lng }) {
        const map = window.marsMapInstance; if (!map) return;
        if (this.tool === 'pin') { map.addMarker('pin-' + Date.now(), lat, lng, { icon: '📌', label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` }); return; }
        if (!this.isDraw()) return;
        if (this.mDone) this.clearMeasure();
        this.pts.push([lat, lng]); this.redrawDraw();
    }
    measureKm(pts) { const m = window.marsMapInstance; let d = 0; for (let i = 1; i < pts.length; i++) d += m.calculateDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); return d; }
    areaKm2(pts) {   // spherical polygon area on Mars (R = 3389.5 km)
        const R = 3389.5, r = Math.PI / 180; let t = 0;
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; t += (b[1] - a[1]) * r * (2 + Math.sin(a[0] * r) + Math.sin(b[0] * r)); }
        return Math.abs(t) * R * R / 2;
    }
    redrawDraw(final = false) {
        const m = window.marsMapInstance.getMap(); this.mLayers.forEach(l => m.removeLayer(l)); this.mLayers = [];
        const col = '#40C4FF', pts = this.pts; if (!pts.length) return;
        this.pts.forEach(p => this.mLayers.push(L.circleMarker(p, { radius: 4, color: '#fff', weight: 1, fillColor: col, fillOpacity: 1, interactive: false }).addTo(m)));
        const area = this.tool === 'area' && pts.length >= 3;
        const shape = area ? L.polygon(pts, { color: col, weight: 2, fillOpacity: 0.18, interactive: false }) : L.polyline(pts, { color: col, weight: 3, dashArray: '6,5', interactive: false });
        shape.addTo(m); this.mLayers.push(shape);
        let txt = null;
        if (area) txt = `Area ${this.areaKm2(pts).toFixed(2)} km² (perimeter ${this.measureKm(pts.concat([pts[0]])).toFixed(2)} km)`;
        else if (pts.length >= 2) txt = `${this.measureKm(pts).toFixed(2)} km`;
        if (txt) { const tip = L.tooltip({ permanent: true, direction: 'top', className: 'measure-tip', offset: [0, -8] }).setLatLng(pts[pts.length - 1]).setContent(txt).addTo(m); this.mLayers.push(tip); this.lastTxt = txt; }
    }
    finishDraw() {
        const need = this.tool === 'area' ? 3 : 2;
        if (this.pts.length < need) { this.showNotification(`Need at least ${need} points.`, 'warning', 3000); return; }
        this.mDone = true; this.redrawDraw(true);
        this.showNotification((this.tool === 'area' ? 'Area: ' : 'Distance: ') + this.lastTxt + ' (Mars great-circle).', 'success', 6000);
    }
    clearMeasure() { const m = window.marsMapInstance?.getMap(); if (m) this.mLayers.forEach(l => m.removeLayer(l)); this.mLayers = []; this.pts = []; this.mDone = false; }

    async capture() {
        if (typeof html2canvas === 'undefined') return this.showNotification('Capture library did not load (needs internet). Use Win+Shift+S instead.', 'warning', 6000);
        this.showNotification('Capturing view…', 'info', 1500);
        try {
            const el = document.getElementById('map-container') || document.getElementById('mars-map');
            const cv = await html2canvas(el, { useCORS: true, backgroundColor: '#05050a', logging: false, scale: 1 });
            cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'marspath-view-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); this.showNotification('Image saved to your Downloads folder.', 'success'); });
        } catch (e) { this.showNotification('Capture failed (' + e.message + '). Use Win+Shift+S as a backup.', 'warning', 7000); }
    }

    bindKeys() {
        document.addEventListener('keydown', e => {
            if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
            if (e.key === 'h' && !e.ctrlKey && !e.altKey) document.getElementById('hud-toggle-btn')?.click();
            if (e.altKey && '1234'.includes(e.key)) this.switchTab(['mission', 'layers', 'route', 'science'][+e.key - 1]);
        });
    }

    startClock() { /* Mission clock is driven by the HUD walk-through (starts at 00:00:00, resets with each new mission). */ }

    /* right panel + status bar follow the cursor */
    bindCursorPanels() {
        let busy = false;
        document.addEventListener('marsmap:mousemove', e => {
            if (busy) return; busy = true; requestAnimationFrame(() => { busy = false; this.updateCursor(e.detail); });
        });
    }
    updateCursor({ lat, lng, elev }) {
        const set = (id, v, cls) => { const el = document.getElementById(id); if (el) { el.textContent = v; if (cls) el.className = 'terrain-info-val ' + cls; } };
        const grid = window.marsMapInstance.terrain, hab = this.cfg.shelters[0], map = window.marsMapInstance;
        set('loc-coords', `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`); set('loc-region', 'Gale Crater (Aeolis Palus / Mt Sharp)'); set('loc-quad', 'MC-23 Aeolis');
        set('loc-hab-dist', map.calculateDistance(lat, lng, hab.lat, hab.lng).toFixed(2) + ' km');
        set('sb-gps', `${lat.toFixed(4)}° / ${lng.toFixed(4)}°`); set('sb-elevation', elev === null ? '—' : elev.toLocaleString() + ' m');
        const q = s => document.querySelector(`#terrain-analysis [data-metric="${s}"]`);
        const i = grid ? grid.latLngToCell(lat, lng) : -1;
        if (i >= 0) {
            const sl = grid.slope[i], m = (window.routePlanner ? window.routePlanner.planner() : this.cfg.planner).modes;
            const [txt, cls] = grid.nogo[i] ? ['NO-GO ZONE', 'text-danger'] : sl > m.balanced.maxSlope ? ['BLOCKED (> ' + m.balanced.maxSlope + '°)', 'text-danger'] : sl > 15 ? ['DIFFICULT', 'text-warning'] : sl > 10 ? ['CAUTION', 'text-warning'] : ['GOOD (slope only)', 'text-success'];
            const sa = q('slope-angle'); if (sa) { sa.textContent = sl.toFixed(1) + '°' + (grid.meta.synthetic ? ' (synthetic)' : ''); sa.className = 'terrain-info-val ' + cls; }
            const tr = q('traversability'); if (tr) { tr.textContent = txt; tr.className = 'terrain-info-val ' + cls; }
        }
        [['rock-abundance', 'not assessed'], ['soil-type', 'not assessed'], ['thermal-inertia', 'see THEMIS layer']].forEach(([k, v]) => { const e = q(k); if (e) { e.textContent = v; e.className = 'terrain-info-val text-muted'; } });
    }

    showNotification(message, type = 'info', duration = 5000) {
        let c = document.getElementById('notification-container');
        if (!c) { c = document.createElement('div'); c.id = 'notification-container'; document.body.appendChild(c); }
        const n = document.createElement('div'); n.className = `notification notification-${type}`;
        n.innerHTML = `<span>${message}</span><button class="notification-close" aria-label="Dismiss">×</button>`;
        n.querySelector('button').onclick = () => n.remove(); c.appendChild(n);
        if (duration) setTimeout(() => n.remove(), duration);
    }
}
window.UIManager = UIManager;
