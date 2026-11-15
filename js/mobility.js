/**
 * MarsPath - Travel-mode profiles.
 * The terrain-cost grid and A* planner are vehicle-agnostic: a "travel mode" only changes speed,
 * slope limits and the time budget. ALL numbers are PROTOTYPE ASSUMPTIONS, not specifications of any
 * real suit or vehicle. Edit them here (or add a profile) to model another platform.
 */
(function () {
    const C = window.MarsPathConfig;
    C.mobility = {
        default: 'foot',
        profiles: {
            foot:  { label: 'On foot (suited EVA)',        short: 'EVA',      flatKmh: 2.5, budgetMin: 480,
                     slopes: { shortest: 25, balanced: 25, cautious: 15 } },
            rover: { label: 'Pressurized rover (crewed)',  short: 'traverse', flatKmh: 12,  budgetMin: 600,
                     slopes: { shortest: 20, balanced: 20, cautious: 12 },
                     speedDerate: { above: 12, perKmh: 0.02 },            // faster driving -> lower traversable slope limit (assumption)
                     resources: { massKg: 3500, crewMassKg: 100, crr: 0.15, eta: 0.7, hotelKw: 1.2, hotelPerCrewKw: 0.2, batteryKwh: 40,
                                  o2KgPerPersonH: 0.035, waterLPerPersonH: 0.12, foodKcalPerPersonH: 117, autonomyH: 48, maxCrew: 3 } }
        }
    };
    /** Planner config for a travel mode: same cost model, different speed + per-mode slope limits. */
    C.effectivePlanner = function (key, opts) {
        const p = C.mobility.profiles[key] || C.mobility.profiles[C.mobility.default];
        const out = JSON.parse(JSON.stringify(C.planner));
        Object.keys(out.modes).forEach(m => { if (p.slopes[m] != null) out.modes[m].maxSlope = p.slopes[m]; });
        out.speedModel.flatKmh = p.flatKmh;
        if (opts && opts.speed) {
            out.speedModel.flatKmh = opts.speed;
            if (p.speedDerate) { const f = Math.max(0.6, 1 - p.speedDerate.perKmh * Math.max(0, opts.speed - p.speedDerate.above));
                Object.keys(out.modes).forEach(m => { out.modes[m].maxSlope = Math.round(out.modes[m].maxSlope * f * 10) / 10; }); }
        }
        return out;
    };
})();
