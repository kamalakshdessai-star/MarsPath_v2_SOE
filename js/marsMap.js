/**
 * MarsMap - Leaflet controller for MarsPath
 * Fixes vs. first draft: uses an EPSG:4326 CRS with Mars radius (Trek EQ tiles are 2x1 at z0, and the
 * Leaflet scale bar must use Mars' radius, not Earth's); only valid NASA layer URLs; no-data-safe zoom;
 * drives the HTML coordinate readout; adds mini-map + measure/pin tools.
 */
class MarsMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.baseLayers = {};
        this.overlayLayers = {};
        this.markers = {};
        this.routeLine = null;
        this.terrain = null;
        this.init();
    }

    init() {
        const cfg = window.MarsPathConfig.map;
        // Leaflet's EPSG4326 uses Earth's radius for distances/scale -> override with Mars.
        this.crs = L.extend({}, L.CRS.EPSG4326, { R: 3389500 });
        this.map = L.map(this.containerId, {
            crs: this.crs, center: cfg.center, zoom: cfg.defaultZoom,
            minZoom: cfg.minZoom, maxZoom: cfg.maxZoom, zoomControl: false,
            maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1.0, worldCopyJump: false
        });
        L.control.zoom({ position: 'topright' }).addTo(this.map);
        L.control.scale({ position: 'bottomleft', maxWidth: 160, metric: true, imperial: false }).addTo(this.map);
        this.map.attributionControl.setPrefix('MarsPath | NASA Solar System Treks');
        this.initBaseLayers();
        this.baseLayers.optical && this.baseLayers.optical.addTo(this.map);
        this.map.on('mousemove', e => this.onMouseMove(e));
        this.map.on('click', e => document.dispatchEvent(new CustomEvent('marsmap:click', { detail: { lat: e.latlng.lat, lng: e.latlng.lng } })));
        this.map.on('dblclick', e => document.dispatchEvent(new CustomEvent('marsmap:dblclick', { detail: { lat: e.latlng.lat, lng: e.latlng.lng } })));
        this.initMiniMap();
        // Tell the user (once) if tiles fail - usually offline / blocked network.
        let errs = 0;
        Object.values(this.baseLayers).forEach(l => l.on('tileerror', () => {
            if (++errs === 12) document.dispatchEvent(new CustomEvent('marsmap:tilefail'));
        }));
    }

    initBaseLayers() {
        const layers = window.MarsPathConfig.map.tileLayers;
        for (const [key, lc] of Object.entries(layers)) {
            if (!lc.url) continue;                       // placeholders / derived layers have no tiles
            this.baseLayers[key] = L.tileLayer(lc.url, {
                attribution: lc.attribution, tileSize: 256, noWrap: true,
                maxNativeZoom: lc.nativeZoom, maxZoom: window.MarsPathConfig.map.maxZoom,
                opacity: lc.opacity ?? 1, zIndex: key === 'optical' ? 1 : 5
            });
        }
    }

    initMiniMap() {
        const el = document.getElementById('mini-map');
        if (!el || !this.baseLayers.optical) return;
        try {
            this.mini = L.map(el, { crs: this.crs, center: [-5.4, 137.8], zoom: 4, zoomControl: false, attributionControl: false,
                dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
            L.tileLayer(window.MarsPathConfig.map.tileLayers.optical.url, { maxNativeZoom: 7, noWrap: true }).addTo(this.mini);
            this.miniRect = L.rectangle(this.map.getBounds(), { color: '#E53935', weight: 1, fillOpacity: 0.15, interactive: false }).addTo(this.mini);
            const upd = () => { this.miniRect.setBounds(this.map.getBounds()); this.mini.setView(this.map.getCenter(), 4, { animate: false }); };
            this.map.on('move zoom', upd); upd();
        } catch (e) { console.warn('[MarsMap] mini-map failed', e); }
    }

    setTerrain(grid) { this.terrain = grid; }

    onMouseMove(e) {
        const { lat, lng } = e.latlng;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('cursor-lat', lat.toFixed(4) + '°'); set('cursor-lon', lng.toFixed(4) + '°');
        const z = this.estimateElevation(lat, lng);
        const txt = z === null ? '— (outside grid)' : z.toLocaleString() + ' m' + (this.terrain && this.terrain.meta.synthetic ? ' (synthetic)' : '');
        set('cursor-elev', txt);
        document.dispatchEvent(new CustomEvent('marsmap:mousemove', { detail: { lat, lng, elev: z } }));
    }

    /** Elevation (m) from the terrain grid; null if outside the grid / no data. No made-up fallback. */
    estimateElevation(lat, lng) {
        if (!this.terrain) return null;
        const z = this.terrain.elevationAt(lat, lng);
        return z === null ? null : Math.round(z);
    }

    toggleLayer(name, visible) {
        const l = this.baseLayers[name] || this.overlayLayers[name];
        if (!l) return;
        if (visible && !this.map.hasLayer(l)) l.addTo(this.map);
        if (!visible && this.map.hasLayer(l)) this.map.removeLayer(l);
    }
    setLayerOpacity(name, o) { const l = this.baseLayers[name] || this.overlayLayers[name]; if (l && l.setOpacity) l.setOpacity(o); }

    addMarker(id, lat, lng, o = {}) {
        const icon = L.divIcon({ className: `mars-marker mars-marker-${o.type || 'default'}`,
            html: `<div class="marker-inner">${o.icon || '📍'}</div><div class="marker-label">${o.label || ''}</div>`,
            iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36] });
        const m = L.marker([lat, lng], { icon: o.customIcon || icon, draggable: !!o.draggable });
        if (o.popup) m.bindPopup(o.popup, { className: 'mars-popup', maxWidth: 300 });
        m.addTo(this.map); this.markers[id] = m; return m;
    }
    removeMarker(id) { if (this.markers[id]) { this.map.removeLayer(this.markers[id]); delete this.markers[id]; } }

    drawRoverTracks() {
        for (const [id, t] of Object.entries(window.MarsPathConfig.roverTracks)) {
            this.overlayLayers['rover-' + id] = L.polyline(t.path, { color: t.color, weight: 2, opacity: 0.7, dashArray: '5,5', className: 'rover-track' })
                .bindTooltip(t.name, { className: 'mars-tooltip', sticky: true });
        }
    }

    flyTo(lat, lng, zoom) { this.map.flyTo([lat, lng], zoom || this.map.getZoom(), { duration: 1.2 }); }
    getMap() { return this.map; }

    /** Great-circle distance on Mars, km. */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 3389.5, rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
window.MarsMap = MarsMap;
