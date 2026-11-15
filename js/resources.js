/**
 * MarsPath - Resource model (ILLUSTRATIVE, prototype assumptions - not a vehicle or suit specification).
 * Builds a consumption TIMELINE along the planned route so the simulation knows exactly where O2 or battery reaches zero.
 *  - On foot: suit O2 and battery are fixed at 100 % capacity; drain rates per minute come from config.suit
 *             (O2: rest / walking / climbing blended by slope; battery: constant drain).
 *  - Rover:   user-selected O2 supply (kg) and battery (kWh). Life support = rate x crew x hours;
 *             energy = driving (work against rolling resistance + climb) + hotel load.
 * Values after depletion keep counting down below 0 so the shortfall is visible.
 */
window.ResourceModel = {
    compute(route, waypoints, travel, profile, o, planner, suit) {
        const P = route.summary.profile, n = P.length, sm = planner.speedModel, g = 3.72076;
        const tO = new Float64Array(n), tB = new Float64Array(n), sO = new Float64Array(n), sB = new Float64Array(n), mins = new Float64Array(n);
        const R = profile.resources, rover = travel === 'rover' && !!R, m = rover ? R.massKg + R.crewMassKg * o.crew : 0;
        const crr = rover ? R.crr * (1 + 0.5 * Math.pow(o.speed / 20, 2)) : 0;
        let eDrive = 0, eHotel = 0, travelMin = 0;
        for (let i = 1; i < n; i++) {
            const d = P[i].d - P[i - 1].d, es = P[i].slope;
            const v = sm.flatKmh * Math.max(sm.minFactor, 1 - es / sm.slopeDegAtMin), min = (d / 1000) / v * 60; mins[i] = min; travelMin += min;
            if (rover) {
                const ed = m * g * (crr * d + Math.max(0, P[i].z - P[i - 1].z)) / R.eta / 3.6e6, eh = (R.hotelKw + R.hotelPerCrewKw * o.crew) * min / 60;
                eDrive += ed; eHotel += eh;
                tB[i] = 100 * (ed + eh) / o.batKwh; tO[i] = 100 * (R.o2KgPerPersonH * o.crew * min / 60) / o.o2CapKg;
            } else {
                const k = Math.min(1, Math.max(0, es / 20));
                tO[i] = min * (suit.o2ConsumptionWalking + (suit.o2ConsumptionClimbing - suit.o2ConsumptionWalking) * k);
                tB[i] = min * suit.batteryDrainRate;
            }
        }
        // time spent on site at each intermediate waypoint (consumption while stationary)
        let stopMin = 0;
        (route.legEnds || []).forEach((idx, k) => {
            if (k >= route.legEnds.length - 1) return;
            const sm_ = (waypoints[k + 1] && waypoints[k + 1].stop) || 0; if (!sm_) return; stopMin += sm_;
            if (rover) {
                const eh = (R.hotelKw + R.hotelPerCrewKw * o.crew) * sm_ / 60; eHotel += eh;
                sB[idx] += 100 * eh / o.batKwh; sO[idx] += 100 * (R.o2KgPerPersonH * o.crew * sm_ / 60) / o.o2CapKg;
            } else { sO[idx] += sm_ * suit.o2ConsumptionRate; sB[idx] += sm_ * suit.batteryDrainRate; }
        });
        const AO = new Float64Array(n), AB = new Float64Array(n);
        for (let i = 1; i < n; i++) { AO[i] = AO[i - 1] + tO[i] + sO[i]; AB[i] = AB[i - 1] + tB[i] + sB[i]; }
        // first point where either resource reaches 0 (>= 100 % used)
        let dep = null, bestKey = Infinity;
        [['O2', AO, tO], ['battery', AB, tB]].forEach(([name, A, T]) => {
            for (let i = 1; i < n; i++) {
                if (A[i] < 100) continue;
                const prev = A[i - 1], endTravel = prev + T[i];
                const inStep = endTravel >= 100, f = inStep ? Math.min(1, Math.max(0, (100 - prev) / Math.max(1e-9, T[i]))) : 1, key = (i - 1) + f;
                if (key < bestKey) {
                    bestKey = key; const a = route.latlngs[i - 1], b = route.latlngs[i];
                    dep = { resource: name, index: i, f, atStop: !inStep, distM: P[i - 1].d + f * (P[i].d - P[i - 1].d),
                            latlng: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] };
                }
                return;
            }
        });
        const total = P[n - 1].d || 1; if (dep) dep.frac = dep.distM / total;
        const usedO2 = AO[n - 1], usedBat = AB[n - 1], totalMin = travelMin + stopMin;
        const out = { type: rover ? 'rover' : 'foot', crew: o.crew, speed: o.speed, o2CapKg: o.o2CapKg, batKwh: o.batKwh,
            AO, AB, TO: tO, TB: tB, usedO2, usedBat, o2Pct: usedO2, batPct: usedBat, o2Left: 100 - usedO2, batLeft: 100 - usedBat,
            dep, depletion: dep, travelH: travelMin / 60, totalH: totalMin / 60, warnings: [] };
        if (rover) {
            const hrs = totalMin / 60; Object.assign(out, { eDrive, eHotel, eTot: eDrive + eHotel,
                o2Kg: R.o2KgPerPersonH * o.crew * hrs, water: R.waterLPerPersonH * o.crew * hrs, food: R.foodKcalPerPersonH * o.crew * hrs });
            out.waterPct = 100 * out.water / (R.waterLPerPersonH * R.maxCrew * R.autonomyH); out.foodPct = 100 * out.food / (R.foodKcalPerPersonH * R.maxCrew * R.autonomyH);
        }
        const km = x => (x / 1000).toFixed(1);
        if (dep) out.warnings.push(`MISSION SHORTFALL: ${dep.resource} reaches 0 after ${km(dep.distM)} km (${(dep.frac * 100).toFixed(0)}% of the route${dep.atStop ? ', while on site' : ''}); at the destination O₂ is ${out.o2Left.toFixed(0)}% and battery ${out.batLeft.toFixed(0)}% (negative = shortfall).`);
        else if (Math.max(usedO2, usedBat) > 70) out.warnings.push(`Resource use reaches ${Math.max(usedO2, usedBat).toFixed(0)}% - under 30% reserve at the destination.`);
        return out;
    },
    /** Remaining % (can go negative) at route position (cell index i, fraction f toward i+1). */
    at(res, i, f) {
        const k = Math.min(res.AO.length - 2, i);
        return { o2: 100 - (res.AO[k] + f * res.TO[k + 1]), bat: 100 - (res.AB[k] + f * res.TB[k + 1]) };
    },
    rows(r) {
        const pct = x => x.toFixed(0) + '%', rows = [];
        if (r.type === 'rover') {
            rows.push(['Crew / speed', `${r.crew} ${r.crew === 1 ? 'person' : 'people'} · ${r.speed} km/h`],
                ['Oxygen supply', `${r.o2Kg.toFixed(2)} kg used of ${r.o2CapKg} kg (${pct(r.usedO2)})`],
                ['Water', `${r.water.toFixed(1)} L (${pct(r.waterPct)} of reserve)`],
                ['Food', `${Math.round(r.food).toLocaleString()} kcal (${pct(r.foodPct)})`],
                ['Energy: driving + hotel', `${r.eDrive.toFixed(1)} + ${r.eHotel.toFixed(1)} = ${r.eTot.toFixed(1)} kWh`],
                ['Battery', `${pct(r.usedBat)} of ${r.batKwh} kWh`]);
        } else rows.push(['Suit oxygen used', pct(r.usedO2) + ' of fixed tank'], ['Suit battery used', pct(r.usedBat) + ' of fixed capacity']);
        rows.push(['Result', r.dep ? `${r.dep.resource} runs out after ${(r.dep.distM / 1000).toFixed(1)} km (${pct(r.dep.frac * 100)} of route). At destination: O₂ ${pct(r.o2Left)}, battery ${pct(r.batLeft)}` : `Completes with O₂ ${pct(r.o2Left)} and battery ${pct(r.batLeft)} remaining`]);
        return rows;
    }
};
