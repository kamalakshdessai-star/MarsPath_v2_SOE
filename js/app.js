/** MarsPath - bootstrap. Order: terrain grid -> map -> layers -> route planner -> science -> environment -> HUD -> UI. */
(function () {
    'use strict';
    async function loadTerrain(cfg) {
        const T = window.MarsTerrain.TerrainGrid; let grid, note = null;
        if (cfg.terrain.realGridUrl) {
            try { const r = await fetch(cfg.terrain.realGridUrl); if (!r.ok) throw new Error(r.status); grid = T.fromJSON(await r.json()); }
            catch (e) { console.warn('[MarsPath] real grid failed, using synthetic:', e); note = 'Could not load real terrain grid (' + cfg.terrain.realGridUrl + ') - serve the folder over http. Using SYNTHETIC terrain.'; }
        }
        if (!grid) grid = T.synthetic(cfg);
        grid.applyHazards(cfg.hazardZones);
        return { grid, note };
    }

    function banner(grid) {
        const el = document.createElement('div'); el.id = 'data-banner';
        el.className = grid.meta.synthetic ? 'synthetic' : 'real';
        el.innerHTML = grid.meta.synthetic
            ? '⚠ TERRAIN = SYNTHETIC MODEL · routes are a software demo, not NASA-derived · hazards are illustrative'
            : `✔ Terrain: ${grid.meta.source} · ${grid.cell} m cells`;
        document.getElementById('map-container')?.appendChild(el);
    }

    async function boot() {
        const cfg = window.MarsPathConfig; const step = (n, fn) => { try { return fn(); } catch (e) { console.error('[MarsPath] ' + n + ' failed:', e); } };
        const ui = step('ui', () => (window.uiManager = new window.UIManager()));
        const { grid, note } = await loadTerrain(cfg);
        const map = step('map', () => (window.marsMapInstance = new window.MarsMap('mars-map'))); if (!map) return;
        map.setTerrain(grid); map.drawRoverTracks(); window.terrainGrid = grid;
        window.layerManager = step('layers', () => new window.LayerManager(map, grid));
        window.routePlanner = step('routing', () => new window.RoutePlanner(map, grid));
        window.missionReport = step('report', () => new window.MissionReport(window.routePlanner, grid));
        window.scienceManager = step('science', () => new window.ScienceManager(map));
        window.weatherDashboard = step('weather', () => new window.WeatherDashboard());
        window.hudOverlay = step('hud', () => new window.HUDOverlay(map));
        banner(grid); const c = map.getMap().getCenter(); ui?.updateCursor({ lat: c.lat, lng: c.lng, elev: map.estimateElevation(c.lat, c.lng) });
        window.layerManager?.setLayerVisibility('poi', true); const poi = document.querySelector('input[data-layer-id="poi"]'); if (poi) poi.checked = true;
        window.layerManager?.setLayerVisibility('hazard', true); const hz = document.querySelector('input[data-layer-id="hazard"]'); if (hz) hz.checked = true;
        ui?.showNotification(note || 'MarsPath ready. Try ROUTE → Auto-route, then press H for the HUD walk-through.', note ? 'warning' : 'success', 7000);
        console.log('[MarsPath] ready', { terrain: grid.meta.source, cells: grid.nx + 'x' + grid.ny });
    }
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
