/**
 * MarsPath - ScienceManager: science targets, mission objectives, sample log (HTML-wired).
 * Target positions are APPROXIMATE (flagged verified:false in config.js).
 */
class ScienceManager {
    constructor(marsMap) {
        this.marsMap = marsMap; this.cfg = window.MarsPathConfig; this.targets = this.cfg.scienceTargets;
        this.samples = [];
        this.objectives = [
            { id: 'o1', text: 'Image and map boxwork mineral veins (Boxwork Formation Alpha)', pri: 'high', done: false },
            { id: 'o2', text: 'Collect clay-rich samples for biosignature analysis (Glen Torridon unit)', pri: 'high', done: false },
            { id: 'o3', text: 'Spectral analysis at 3+ distinct units', pri: 'med', done: false },
            { id: 'o4', text: 'Map stratigraphy at the Mount Sharp base', pri: 'med', done: false },
            { id: 'o5', text: 'Log radiation baseline at every stop', pri: 'low', done: false }
        ];
        this.renderObjectives(); this.renderTargets(); this.renderSamples();
        document.getElementById('btn-add-sample')?.addEventListener('click', () => this.logSample());
    }
    iconFor(t) { return { geology: 'mountain-sun', stratigraphy: 'layer-group', mineralogy: 'gem', astrobiology: 'dna', hydrology: 'droplet' }[t] || 'flask'; }

    renderObjectives() {
        const el = document.getElementById('objectives-list'); if (!el) return;
        el.innerHTML = this.objectives.map(o => `<div class="objective-item" data-objective="${o.id}">
            <input type="checkbox" class="objective-check" id="${o.id}" ${o.done ? 'checked' : ''}>
            <label class="objective-text ${o.done ? 'completed' : ''}" for="${o.id}">${o.text}</label>
            <span class="objective-priority priority-${o.pri === 'med' ? 'medium' : o.pri}">${o.pri.toUpperCase()}</span></div>`).join('');
        el.querySelectorAll('.objective-check').forEach(cb => cb.addEventListener('change', () => {
            const o = this.objectives.find(x => x.id === cb.id); o.done = cb.checked;
            cb.nextElementSibling.classList.toggle('completed', cb.checked);
        }));
    }

    renderTargets() {
        const el = document.getElementById('science-targets-list'); if (!el) return;
        el.innerHTML = this.targets.map(t => `<div class="science-target" data-target="${t.id}">
            <div class="science-target-header"><span class="science-target-name"><i class="fa-solid fa-${this.iconFor(t.type)} text-accent" style="margin-right:6px"></i>${t.name}</span>
            <span class="science-tag">${t.type.toUpperCase()}</span></div>
            <div class="science-target-desc">${t.description}</div>
            <div class="st-meta">⏱ ${t.estimatedTime} min · ${t.priority.toUpperCase()} · <span class="st-warn">position approximate</span></div>
            <div class="st-actions"><button class="route-btn" data-act="go">Locate</button><button class="route-btn primary" data-act="add">Add to route</button></div></div>`).join('');
        el.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]'); if (!b) return;
            const t = this.targets.find(x => x.id === b.closest('.science-target').dataset.target);
            if (b.dataset.act === 'go') this.marsMap.flyTo(t.lat, t.lng, 11); else window.routePlanner?.addScienceTarget(t.id);
        });
    }

    renderSamples() {
        const el = document.getElementById('sample-log'); if (!el) return;
        el.innerHTML = this.samples.length ? this.samples.map(s => `<div class="sample-entry"><div class="sample-icon"><i class="fa-solid fa-vial"></i></div>
            <div class="sample-info"><div class="sample-id">${s.id}</div><div class="sample-type">${s.type} — ${s.where}</div></div><span class="sample-ok">✓ Logged</span></div>`).join('')
            : '<p class="empty-state">No samples logged. “Log sample” records one at the science target nearest the map centre.</p>';
    }

    logSample() {
        const c = this.marsMap.getMap().getCenter();
        const t = this.targets.slice().sort((a, b) => this.marsMap.calculateDistance(c.lat, c.lng, a.lat, a.lng) - this.marsMap.calculateDistance(c.lat, c.lng, b.lat, b.lng))[0];
        const type = { geology: 'Rock core', stratigraphy: 'Rock chip', mineralogy: 'Spectral scan + brush', astrobiology: 'Drill core (sterile)', hydrology: 'Sediment core' }[t.type] || 'Sample';
        this.samples.push({ id: 'GC-' + String(this.samples.length + 1).padStart(3, '0'), type, where: t.name }); this.renderSamples();
    }
    getScienceData() { return { targets: this.targets, samples: this.samples, objectives: this.objectives }; }
}
window.ScienceManager = ScienceManager;
