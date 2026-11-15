/**
 * MarsPath - LayerManager
 * Wires the HTML layer toggles (.layer-toggle[data-layer] + input[data-layer-id]) to:
 *   - NASA Trek tile layers   (optical, topographic, thermal)      -> MEASURED
 *   - generated rasters       (slope from the terrain grid)        -> DERIVED (SYNTHETIC until real DEM)
 *   - vector overlays         (hazard zones, POIs, rover line...)  -> INTERPRETED / SIMULATED
 * Every toggle row gets a provenance badge so simulated data is never passed off as measured.
 */
class LayerManager {
    constructor(marsMap, terrain) {
        this.marsMap = marsMap; this.map = marsMap.getMap(); this.terrain = terrain;
        this.groups = {};            // vector / image overlays by data-layer key
        this.active = new Set(['optical']);
        this.lastRaster = 'optical';
        this.cfg = window.MarsPathConfig;
        this.build();
        this.bind();
        this.badges();
    }

    build() {
        this.groups.hazard = this.hazardLayer();
        this.groups.radiation = this.radiationLayer();
        this.groups.slope = this.slopeLayer();
        this.groups.poi = this.poiLayer();
        this.groups.shelters = this.shelterLayer();
        this.groups['rover-tracks'] = this.marsMap.overlayLayers['rover-curiosity'];
        this.groups.shelters.addTo(this.map);
    }

    /* ---------- toggles ---------- */
    bind() {
        document.querySelectorAll('.layer-toggle input[data-layer-id]').forEach(inp => {
            inp.addEventListener('change', () => this.set(inp.dataset.layerId, inp.checked));
        });
        const sl = document.getElementById('layer-opacity-slider'), val = document.getElementById('layer-opacity-value');
        if (sl) sl.addEventListener('input', () => {
            const o = sl.value / 100; if (val) val.textContent = sl.value + '%';
            const g = this.groups[this.lastRaster];
            if (this.marsMap.baseLayers[this.lastRaster]) this.marsMap.setLayerOpacity(this.lastRaster, o);
            else if (g && g.setOpacity) g.setOpacity(o);
        });
    }

    set(name, visible) {
        const tile = this.marsMap.baseLayers[name];
        if (tile) this.marsMap.toggleLayer(name, visible);
        const g = this.groups[name];
        if (g) { visible ? g.addTo(this.map) : this.map.removeLayer(g); }
        visible ? this.active.add(name) : this.active.delete(name);
        if (visible && (tile || name === 'slope')) this.lastRaster = name;
        const row = document.querySelector(`.layer-toggle[data-layer="${name}"]`);
        if (row) row.classList.toggle('active', visible);
        document.dispatchEvent(new CustomEvent('layers:changed', { detail: { layer: name, visible, active: [...this.active] } }));
    }
    setLayerVisibility(n, v) {                      // kept for API compatibility with app.js
        const inp = document.querySelector(`input[data-layer-id="${n}"]`);
        if (inp) inp.checked = v; this.set(n, v);
    }

    /* ---------- provenance badges ---------- */
    badges() {
        const P = this.cfg.provenance, T = this.cfg.map.tileLayers;
        const synth = this.terrain && this.terrain.meta.synthetic;
        const kind = {
            optical: T.optical.kind, topographic: T.topographic.kind, thermal: T.thermal.kind,
            mineral: 'placeholder', slope: synth ? 'simulated' : 'derived',
            radiation: 'simulated', hazard: 'interpreted', poi: 'interpreted', 'rover-tracks': 'simulated'
        };
        const notes = {
            optical: T.optical.note, topographic: T.topographic.note, thermal: T.thermal.note, mineral: T.mineral.note,
            slope: synth ? 'Slope computed from a SYNTHETIC terrain model. Load a real DEM grid for NASA-derived slope.' : 'Slope derived from the loaded DEM grid.',
            radiation: 'ILLUSTRATIVE zones. Only the Gale surface baseline (0.67 mSv/day, MSL RAD) is measured.',
            hazard: 'Interpreted no-go / caution zones - ILLUSTRATIVE placeholders until interpreted from HiRISE/CTX.',
            poi: 'Science targets - positions APPROXIMATE/unverified; verify against MSL traverse data.',
            'rover-tracks': 'Schematic line only - NOT the real Curiosity traverse.'
        };
        document.querySelectorAll('.layer-toggle').forEach(row => {
            const k = row.dataset.layer, p = P[kind[k]]; if (!p) return;
            const sub = row.querySelector('.layer-toggle-sub');
            if (sub) sub.insertAdjacentHTML('beforeend', ` <span class="prov-badge" style="--pc:${p.color}">${p.label}</span>`);
            row.title = notes[k] || '';
            if (kind[k] === 'placeholder') {
                const inp = row.querySelector('input'); if (inp) { inp.disabled = true; inp.checked = false; }
                row.classList.add('disabled');
            }
        });
        const subs = { optical: 'Viking MDIM 2.1 · 232 m/px (CTX/HiRISE TODO)', topographic: 'MOLA shaded relief · 463 m/px', thermal: 'THEMIS daytime IR · archived', slope: 'Derived from terrain grid', radiation: 'Illustrative zones', hazard: 'Interpreted no-go / caution', 'rover-tracks': 'Schematic route', mineral: 'CRISM - not yet sourced' };
        for (const [k, t] of Object.entries(subs)) {
            const s = document.querySelector(`.layer-toggle[data-layer="${k}"] .layer-toggle-sub`);
            if (s) s.childNodes[0].textContent = t;
        }
    }

    /* ---------- generated layers ---------- */
    levelColor(level) { return { caution: '#FFD600', danger: '#FF9100', impassable: '#FF1744' }[level] || '#FFD600'; }

    hazardLayer() {
        const g = L.layerGroup();
        this.cfg.hazardZones.forEach(z => {
            const col = this.levelColor(z.level);
            L.circle(z.center, { radius: z.radius, color: col, fillColor: col, fillOpacity: 0.18, weight: 2, dashArray: '5,5', className: 'hazard-zone' })
                .bindTooltip(`⚠ ${z.label} - ${z.level === 'caution' ? 'extra cost' : 'NO-GO'}`, { className: 'mars-tooltip', direction: 'top' }).addTo(g);
        });
        return g;
    }

    radiationLayer() { return L.layerGroup(); }   // illustrative circles removed - baseline shown in right panel

    /** Raster overlay of slope classes + no-go cells from the terrain grid. */
    slopeLayer() {
        const t = this.terrain; if (!t) return L.layerGroup();
        const maxS = this.cfg.planner.modes.balanced.maxSlope;
        const cv = document.createElement('canvas'); cv.width = t.nx; cv.height = t.ny;
        const ctx = cv.getContext('2d'), img = ctx.createImageData(t.nx, t.ny);
        for (let i = 0; i < t.slope.length; i++) {
            const s = t.slope[i]; let c;
            if (t.unknown[i]) c = [120, 120, 120, 120];
            else if (t.nogo[i]) c = [190, 40, 200, 200];
            else if (s > maxS) c = [255, 23, 68, 190];
            else if (s > 15) c = [255, 145, 0, 150];
            else if (s > 10) c = [255, 214, 0, 120];
            else if (s > 5) c = [140, 220, 90, 80];
            else c = [0, 230, 118, 55];
            img.data.set(c, i * 4);
        }
        ctx.putImageData(img, 0, 0);
        return L.imageOverlay(cv.toDataURL(), t.bounds, { opacity: 0.8, className: 'slope-raster', interactive: false });
    }

    poiLayer() {
        const g = L.layerGroup(), colors = { critical: '#FF1744', high: '#FF9100', medium: '#FFD600', low: '#29B6F6' };
        this.cfg.scienceTargets.forEach(t => {
            const icon = L.divIcon({ className: 'science-poi-marker', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22],
                html: `<div class="science-marker" style="border-color:${colors[t.priority]}"><span>${t.icon}</span></div>` });
            const li = a => a.map(x => `<li>${x}</li>`).join('');
            L.marker([t.lat, t.lng], { icon }).bindPopup(`
                <div class="poi-popup"><div class="poi-head"><b>${t.id}</b><span class="poi-prio" style="background:${colors[t.priority]}">${t.priority.toUpperCase()}</span></div>
                <h3>${t.icon} ${t.name}</h3><p class="poi-warn">⚠ Position approximate / unverified</p><p>${t.description}</p>
                <h4>Objectives</h4><ul>${li(t.objectives)}</ul><h4>Hazards</h4><ul>${li(t.hazards)}</ul>
                <p class="poi-meta">⏱ ${t.estimatedTime} min on site</p>
                <button class="poi-btn" onclick="window.routePlanner&&window.routePlanner.addScienceTarget('${t.id}')">➕ Add as route stop</button></div>`,
                { className: 'mars-popup', maxWidth: 320 }).bindTooltip(`${t.icon} ${t.name}`, { className: 'mars-tooltip', direction: 'top', offset: [0, -20] }).addTo(g);
        });
        return g;
    }

    shelterLayer() {
        const g = L.layerGroup(), ic = { habitat: '🏠', shelter: '⛺', rover: '🚗' };
        this.cfg.shelters.forEach(s => {
            L.circle([s.lat, s.lng], { radius: 500, color: '#00E676', fillColor: '#00E676', fillOpacity: 0.05, weight: 1, dashArray: '4,4', interactive: false }).addTo(g);
            L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'shelter-marker', html: `<div class="shelter-inner">${ic[s.type] || '🏠'}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
                .bindPopup(`<div class="poi-popup"><h3>${ic[s.type]} ${s.name}</h3><p>${s.id} - capacity ${s.capacity}</p><p class="poi-warn">Hypothetical asset (mission concept)</p></div>`, { className: 'mars-popup' }).addTo(g);
        });
        return g;
    }
    getActiveLayers() { return [...this.active]; }
}
window.LayerManager = LayerManager;
