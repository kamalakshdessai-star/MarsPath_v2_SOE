/**
 * MarsPath - Mission Planning Report (PDF Stage 6)
 * Builds a printable report from the current route: start/destination, distance, elevation, max slope,
 * hazards near/along route, science stops, route type, all-mode comparison and WHY the selected route fits.
 * Output: on-screen modal + Print/Save-as-PDF + Download HTML. Every figure is an ESTIMATE from available observations.
 */
(function () {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const CSS = `body{margin:0;background:#eee}.mp-report{max-width:900px;margin:0 auto;background:#fff;color:#1a1a1a;padding:32px 38px;font:13px/1.5 Inter,Arial,sans-serif}.mp-report h1{margin:0;font-size:22px;color:#B71C1C}.mp-report h2{margin:22px 0 8px;font-size:14px;border-bottom:2px solid #B71C1C;padding-bottom:3px;text-transform:uppercase}.mp-report .sub{color:#666;font-size:12px}.mp-report table{width:100%;border-collapse:collapse;margin:6px 0}.mp-report th,.mp-report td{border:1px solid #d5d5d5;padding:5px 8px;text-align:left;vertical-align:top}.mp-report th{background:#f2f2f2;width:34%}.mp-report table.grid th{width:auto}.mp-report tr.sel td{background:#FFF3E0;font-weight:600}.mp-report .bad{color:#C62828;font-weight:700}.mp-report ul{margin:6px 0;padding-left:20px}.mp-report .disc{margin-top:18px;padding:10px 12px;background:#FFF8E1;border-left:4px solid #FF9100;font-size:12px}`;

    class MissionReport {
        constructor(rp, grid) {
            this.rp = rp; this.grid = grid; this.cfg = window.MarsPathConfig; this.PF = window.MarsPathfinding;
            const modal = document.createElement('div'); modal.id = 'report-modal';
            modal.innerHTML = `<div class="report-bar"><button class="primary" id="rep-print">🖨 Print / Save as PDF</button><button id="rep-dl">⬇ Download HTML</button><button id="rep-close">✕ Close</button></div><div class="mp-report" id="rep-body"></div>`;
            document.body.appendChild(modal);
            document.getElementById('rep-close').onclick = () => modal.classList.remove('open');
            document.getElementById('rep-print').onclick = () => window.print();
            document.getElementById('rep-dl').onclick = () => this.download();
            const anchor = document.getElementById('route-report');
            if (anchor) { const w = document.createElement('div'); w.className = 'report-wrap'; w.innerHTML = '<button class="report-btn" id="btn-gen-report"><i class="fa-solid fa-file-lines"></i> GENERATE MISSION REPORT</button>'; anchor.insertAdjacentElement('afterend', w); w.querySelector('button').onclick = () => this.generate(); }
        }

        nearZones(latlngs) {
            const g = this.grid, out = [];
            this.cfg.hazardZones.forEach(z => {
                let best = Infinity;
                latlngs.forEach(p => { const d = Math.hypot((p[1] - z.center[1]) * g.mPerDegLon, (p[0] - z.center[0]) * g.mPerDegLat) - z.radius; if (d < best) best = d; });
                if (best <= 500) out.push({ z, gap: Math.max(0, best), inside: best <= 0 });
            });
            return out;
        }
        fmt(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${h}:${String(m).padStart(2, '0')} h`; }
        ll(w) { return `${w.lat.toFixed(4)}°, ${w.lng.toFixed(4)}°`; }

        profileSvg(profile) {
            const W = 700, H = 170, pad = 40, zs = profile.map(p => p.z), lo = Math.min(...zs), hi = Math.max(...zs), D = profile[profile.length - 1].d || 1;
            const x = d => pad + (d / D) * (W - pad - 10), y = z => H - 24 - ((z - lo) / Math.max(1, hi - lo)) * (H - 44);
            const pts = profile.map(p => `${x(p.d).toFixed(1)},${y(p.z).toFixed(1)}`).join(' ');
            return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="background:#fafafa;border:1px solid #ddd"><polyline points="${pts}" fill="none" stroke="#B71C1C" stroke-width="2"/>
              <text x="4" y="${y(hi) + 4}" font-size="10" fill="#555">${Math.round(hi)} m</text><text x="4" y="${y(lo) + 4}" font-size="10" fill="#555">${Math.round(lo)} m</text>
              <text x="${pad}" y="${H - 6}" font-size="10" fill="#555">0 km</text><text x="${W - 60}" y="${H - 6}" font-size="10" fill="#555">${(D / 1000).toFixed(1)} km</text></svg>`;
        }

        generate() {
            const rp = this.rp, cfg = this.cfg, PL = rp.planner(), PR = rp.profile(), M = PL.modes, cur = rp.results[rp.mode];
            if (!cur || !cur.ok) { rp.notify('Plan a route first: add a start and a destination (ADD WP or AUTO), then generate the report.'); return; }
            const pts = rp.waypoints.map(w => [w.lat, w.lng]), all = {};
            Object.keys(M).forEach(m => { all[m] = m === rp.mode ? cur : this.PF.planRoute(this.grid, pts, m, PL); });
            const W = rp.waypoints, s = cur.summary, prof = s.profile, stops = W.slice(1, -1).filter(w => w.targetId);
            const stopMin = rp.stopMinutes(), total = s.minutes + stopMin, over = total > rp.budget();
            const near = this.nearZones(cur.latlngs);
            const sh = all.shortest && all.shortest.ok ? all.shortest.summary : null;
            const why = [];
            if (rp.mode === 'shortest') why.push('This is the <b>shortest-distance</b> route: it minimises ground distance while still obeying the hard limits (no-go zones and slopes above ' + M.shortest.maxSlope + '°). It does not trade distance for gentler terrain.');
            else if (sh) { const dk = (s.distanceM - sh.distanceM) / 1000, dp = (s.distanceM / sh.distanceM - 1) * 100; why.push(`Compared with the shortest route (${(sh.distanceM / 1000).toFixed(2)} km), this <b>${M[rp.mode].label}</b> route is ${dk >= 0 ? dk.toFixed(2) + ' km (' + dp.toFixed(0) + '%) longer' : Math.abs(dk).toFixed(2) + ' km shorter'}, and its steepest slope is ${s.maxSlope.toFixed(1)}° versus ${sh.maxSlope.toFixed(1)}°.`); }
            if (all.cautious && all.cautious.ok && rp.mode !== 'cautious') { const c = all.cautious.summary; why.push(`A cautious route would be ${(c.distanceM / 1000).toFixed(2)} km with a steepest slope of ${c.maxSlope.toFixed(1)}° (lower slope exposure, longer distance).`); }
            if (stops.length) why.push(`The route visits ${stops.length} science target(s); stops were treated as waypoints and never allowed to override a no-go zone.`);
            const rows = Object.keys(M).map(m => { const r = all[m]; if (!r || !r.ok) return `<tr><td>${esc(M[m].label)}</td><td colspan="5" class="bad">no route under these limits</td></tr>`; const x = r.summary;
                return `<tr class="${m === rp.mode ? 'sel' : ''}"><td>${esc(M[m].label)} (≤${M[m].maxSlope}°)</td><td>${(x.distanceM / 1000).toFixed(2)}</td><td>${this.fmt(x.minutes)}</td><td>${x.maxSlope.toFixed(1)}° / ${x.p95Slope.toFixed(1)}°</td><td>${this.nearZones(r.latlngs).length}</td><td>${(x.cost / x.distanceM).toFixed(2)}×</td></tr>`; }).join('');
            let prev = 0;
            const wrows = W.map((w, i) => { let leg = '—'; if (i > 0) { const e = cur.legEnds[i - 1]; leg = ((prof[e].d - prof[prev].d) / 1000).toFixed(2) + ' km'; prev = e; }
                const z = this.rp.marsMap.estimateElevation(w.lat, w.lng); return `<tr><td>${i === 0 ? 'Start' : i === W.length - 1 ? 'Destination' : 'Stop ' + i}</td><td>${esc(w.name)}${w.targetId ? ' (science)' : ''}</td><td>${this.ll(w)}</td><td>${z === null ? '—' : z.toLocaleString() + ' m'}</td><td>${leg}</td></tr>`; }).join('');
            const hz = near.length ? '<ul>' + near.map(n => `<li><b>${esc(n.z.id)}</b> ${esc(n.z.label)} — ${n.inside ? '<span class="bad">route passes through</span>' : 'closest approach ' + Math.round(n.gap) + ' m from the zone edge'}</li>`).join('') + '</ul>' : '<p>No identified hazard zone within 500 m of the route.</p>';
            const limits = [...s.warnings, ...(rp.res ? rp.res.warnings : []), `Travel mode: ${PR.label}. Assumed ${PR.flatKmh} km/h on flat ground, slowing with slope; ${PR.short} budget ${this.fmt(rp.budget())}.`, `Slope limits (${Object.values(PR.slopes).join('° / ')}°) and cost weights are prototype planning rules, not certified suit or vehicle limits.`, 'Hazard zones are our own interpretation of orbital data; rocks, boulders and soft ground below the grid cell size are not assessed.', 'Suit consumables, communications windows, radiation events and crew fatigue are not modelled.'];
            const html = `<h1>MarsPath — Mission Planning Report</h1>
              <div class="sub">Gale Crater study area · generated ${esc(new Date().toLocaleString())} · terrain: ${esc(this.grid.meta.source)} (${this.grid.cell} m cells)</div>
              <h2>1. Route summary</h2><table>
              <tr><th>Starting position</th><td>${this.ll(W[0])} — ${esc(W[0].name)}</td></tr>
              <tr><th>Destination</th><td>${this.ll(W[W.length - 1])} — ${esc(W[W.length - 1].name)}</td></tr>
              <tr><th>Travel mode</th><td>${esc(PR.label)}</td></tr>
              <tr><th>Route type</th><td>${esc(M[rp.mode].label)}</td></tr>
              <tr><th>Route distance</th><td>${(s.distanceM / 1000).toFixed(2)} km ground (${(s.distance3dM / 1000).toFixed(2)} km along the surface)</td></tr>
              <tr><th>Elevation</th><td>start ${Math.round(prof[0].z).toLocaleString()} m → end ${Math.round(prof[prof.length - 1].z).toLocaleString()} m · climb +${Math.round(s.gain)} m / descent −${Math.round(s.loss)} m</td></tr>
              <tr><th>Maximum slope</th><td>${s.maxSlope.toFixed(1)}° (95th percentile ${s.p95Slope.toFixed(1)}°, mean ${s.meanSlope.toFixed(1)}°) from the loaded DEM</td></tr>
              <tr><th>Hazard zones near / on route</th><td>${near.length} (within 500 m)</td></tr>
              <tr><th>Science stops</th><td>${stops.length}${stops.length ? ': ' + stops.map(x => esc(x.name)).join('; ') : ''}</td></tr>
              <tr><th>Estimated ${PR.short} time</th><td>${this.fmt(s.minutes)} travel + ${this.fmt(stopMin)} on site = <span class="${over ? 'bad' : ''}">${this.fmt(total)}</span> (budget ${this.fmt(rp.budget())}${over ? ' — EXCEEDED' : ''})</td></tr></table>
              <h2>2. Waypoints</h2><table class="grid"><tr><th>Role</th><th>Name</th><th>Coordinates</th><th>Elevation</th><th>Leg</th></tr>${wrows}</table>
              <h2>3. Elevation profile</h2>${this.profileSvg(prof)}
              <h2>4. Hazards</h2>${hz}
              ${rp.res ? '<h2>4b. ' + (rp.res.type === 'rover' ? 'Rover resource estimate' : 'Suit consumables estimate') + ' (illustrative)</h2><table>' + window.ResourceModel.rows(rp.res).map(x => '<tr><th>' + x[0] + '</th><td>' + x[1] + '</td></tr>').join('') + '</table>' : ''}
              <h2>5. Why this route</h2><ul>${why.map(x => '<li>' + x + '</li>').join('')}</ul>
              <table class="grid"><tr><th>Mode</th><th>km</th><th>Time</th><th>Max / p95 slope</th><th>Hazard zones near</th><th>Cost vs distance</th></tr>${rows}</table>
              <h2>6. Data, assumptions and limitations</h2><ul>${limits.map(x => '<li>' + esc(x) + '</li>').join('')}</ul>
              <div class="disc"><b>Disclaimer:</b> every value in this report is an estimate based on available NASA observations and stated assumptions. It is a planning demonstration and not a guarantee of astronaut safety.</div>`;
            document.getElementById('rep-body').innerHTML = html; this.last = html;
            document.getElementById('report-modal').classList.add('open');
        }
        download() { if (!this.last) return; const doc = `<!doctype html><html><head><meta charset="utf-8"><title>MarsPath Mission Report</title><style>${CSS}</style></head><body><div class="mp-report">${this.last}</div></body></html>`; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); a.download = 'MarsPath_Mission_Report.html'; a.click(); }
    }
    window.MissionReport = MissionReport;
})();
