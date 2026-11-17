# MarsPath — Surface Mobility Planner for Crewed Mars Exploration

**NASA Space Apps Challenge 2026 · Challenge: MarsPath: Route Planning for Crewed Mars Exploration**
**Team:** Space Express · **Live demo:** https://kamalakshdessai-star.github.io/MarsPath_v2_SOE/ · **Slides:** https://docs.google.com/presentation/d/19d1Rrc5scahmCS-IiDDeOk_fBUQqL7T3/edit?usp=sharing&ouid=103336403847445405364&rtpof=true&sd=true · **Working video:**

MarsPath is an interactive mission-planning map for a hypothetical crew exploring the
north-west foothills of Aeolis Mons (Mount Sharp) in **Gale Crater** — on foot during a suited EVA, or by a
crewed pressurized rover. It combines several NASA datasets into one view, turns real elevation data into a
terrain-cost map, plans routes with **A\*** that avoid hazards, and produces a **mission planning report**
that explains why a route was chosen. The terrain model and planner are vehicle-agnostic; a *travel mode*
only changes speed, slope limits and the time budget.

> **Honesty statement.** MarsPath is a planning *demonstration*. Every output is an estimate from
> available observations and stated assumptions. It is **not** a certified human-traversal safety tool.
> The table below says exactly which data is real, which is derived, and which is illustrative.

---

## Why Gale Crater?
- The challenge brief itself points to Mount Sharp and the 2025 boxwork discovery as an example.
- Curiosity is the only mission with in-situ surface radiation (RAD) and weather (REMS) measurements,
  so a human-safety map can be anchored in real surface data.
- Strong orbital coverage (MOLA, HRSC, THEMIS, Viking, CRISM) and a well-documented rover traverse.

## Screenshots
*(add 3–4 images here: layered map · route comparison · mission report · HUD view)*

## What it does
| Feature | How it works |
|---|---|
| **Layered map** | NASA Mars Trek tile layers + DEM-derived slope, toggled in the LAYERS tab, each with a provenance badge |
| **Travel modes** | *On foot (suited EVA)* or *Pressurized rover (crewed)*: same terrain-cost grid and A\*, different speed, slope limits and time budget (`js/mobility.js`; prototype assumptions, not specifications of any real suit or vehicle) |
| **Rover speed, crew & resources** | In rover mode choose speed (4–20 km/h) and crew (1–3). Faster driving lowers the slope limit; oxygen, water, food, energy and battery use are estimated for the route (illustrative consumption rates, `js/resources.js`) |
| **Resource-depletion simulation** | O₂ and battery are tracked along the route (fixed suit capacity on foot; **selectable O₂ supply and battery capacity for the rover**). In the HUD walk the completed path is green until a resource hits zero, then red; the failure point is highlighted and the readouts keep counting below 0 to show the shortfall |
| **Area-based environment panel** | Temperature, pressure, wind and radiation follow the **map area in view** (elevation and slope from the DEM) plus a modelled daily cycle; daily range from Curiosity REMS when the live feed answers |
| **Terrain-cost grid** | 200 m grid from the real MOLA-HRSC DEM: elevation → slope (Horn 3×3) → roughness (slope variability) → cost |
| **A\* route planner** | 8-connected search, no corner-cutting through blocked cells, no-go zones and steep slopes excluded |
| **3 route modes** | Shortest · Lower terrain cost · Cautious (different weights; slope limits 25°/25°/15° on foot, 20°/20°/12° by rover) |
| **AUTO** | Shortest route between the start and destination you click; reorders middle stops to minimise distance |
| **SCIENCE ROUTE** | Picks science targets that fit the time budget of the selected travel mode (8 h on foot, 10 h by rover — assumed), starting from the best base |
| **Mission report** | Start/destination, distance, elevation, max slope, hazards near route, science stops, route type, elevation profile, mode comparison and rationale; printable / downloadable |
| **HUD walk-through** | Visor-style view that follows the planned route (heading, elevation, speed, next waypoint, slope warnings, mission clock) |
| **Tools** | Ruler (distance), area, pin, image capture |

**Cost function** (per step between neighbouring cells):

`C = d · (1 + wₛ·S + wᵣ·R + wᵤ·U + wₕ·H)`

`d` = step distance · `S` = (edge slope / max slope)² · `R` = local slope variability · `U` = no-data cell · `H` = caution zone.
Weights per mode are in `js/config.js → planner.modes`. Because every penalty is ≥ 0, the octile heuristic is
admissible, so A\* returns the optimal path for the chosen cost (verified against Dijkstra in `tests/run-tests.js`).

## Data sources — what is real and what is not
| Item | Source | Status |
|---|---|---|
| Optical basemap | Viking MDIM 2.1 colour mosaic, 232 m/px (NASA Solar System Treks WMTS) | **Measured** (NASA) |
| Elevation shading | MGS MOLA colour shaded relief, 463 m/px (Trek WMTS) | **Measured** (NASA) |
| Thermal | Mars Odyssey THEMIS daytime IR mosaic, 100 m/px (Trek WMTS) | **Measured** (NASA); archived brightness, not live temperature |
| Elevation grid for routing | NASA/USGS **MOLA-HRSC Blended DEM, 200 m** (Mars Express HRSC + MGS MOLA), resampled to 200 m cells | **Measured**, processed by `tools/make_terrain_grid.py` |
| Slope layer & traversability | Computed in-browser from that DEM | **Derived** |
| Radiation baseline 0.67 mSv/day | Curiosity RAD, Hassler et al., *Science* 343 (2014) | **Measured** (published value) |
| Science target positions | Approximate positions of well-known Curiosity sites from public mission records | **Approximate** — not survey-grade |
| Hazard zones (2 no-go areas) | Interpreted by the team from orbital imagery context | **Interpreted** |
| Weather panel (temp/pressure/wind/radiation) | Curiosity REMS daily range when reachable, else typical Gale values; altitude, slope and daily-cycle effects are simple physical models (cooler and lower pressure with height, windier on slopes, more dose where air is thin) | **Modelled** |
| HUD O₂/battery, crew, travel speeds and budgets | Prototype assumptions | **Illustrative** |

## Assumptions and limitations
- **200 m cells:** rocks, boulders, soft sand and small scarps are *not* assessed. MOLA/HRSC cannot see walking-scale obstacles.
- Slope limits and cost weights are **prototype rules**, not certified suit, human-mobility or vehicle limits.
- Speeds are assumptions (on foot 2.5 km/h, rover 12 km/h on flat ground, both reduced with slope); time budgets 8 h / 10 h. Rover mode is a generic crewed-rover concept, not a specific vehicle. Suit/vehicle consumables, comms windows,
  solar-particle events and crew fatigue are **not modelled**.
- Solar-particle events / live space weather are **not** connected; the radiation panel shows the measured GCR baseline only.
- Basemap resolution is coarse at EVA scale (Viking tiles end near zoom 7). Next step: CTX/HiRISE tiles and DTMs.

## Run it locally
```bash
cd MarsPath_v2
python -m http.server 8000      # then open http://localhost:8000
```
Needs internet for the NASA tiles and the CDN libraries (Leaflet, Chart.js, Font Awesome, html2canvas, Inter).
It must be served over http(s) (not opened as `file://`) so the elevation grid can load.

**Quick tour:** choose a *Travel mode* in the ROUTE tab · LAYERS → switch on MOLA / THEMIS / Slope → click a science marker → ROUTE → **AUTO**, click a start and a destination →
tick *Compare all three modes* → **GENERATE MISSION REPORT** → press **H** for the HUD walk-through.

## Rebuild the terrain grid from NASA data
```bash
pip install rasterio numpy
python tools/fetch_gale_dem.py          # downloads only the Gale window of the MOLA-HRSC DEM
python tools/make_terrain_grid.py data/gale_dem.tif --south -5.55 --north -4.50 --west 137.35 --east 137.95 \
  --cell 200 --source "NASA MOLA-HRSC Blended DEM 200m" --out data/gale_terrain_grid.json
```
The raw GeoTIFF is not committed (size); the processed `data/gale_terrain_grid.json` is.

## Tests
```bash
node tests/run-tests.js     # 12 checks: A* == Dijkstra cost, obstacle avoidance, no corner cutting, slope maths, metric distances
```

## Project structure
```
index.html            UI layout            js/config.js      targets, hazards, planner modes, provenance
js/terrain.js         DEM grid, slope      js/pathfinding.js A* / Dijkstra / route statistics
js/routing.js         route UI, AUTO       js/report.js      mission report
js/layers.js          layers & badges      js/hud.js         HUD walk-through
js/marsMap.js         Leaflet + Mars CRS   js/mobility.js    travel-mode profiles (foot / rover)
tools/                DEM download & grid builder
```
Map projection: Trek "EQ" tiles are drawn with an EPSG:4326 Leaflet CRS using Mars' radius, so the scale bar and distances use Mars geometry.

## Credits and tools
NASA Solar System Treks, MGS MOLA, Mars Express HRSC, Mars Odyssey THEMIS, Viking, Curiosity RAD/REMS and MSL mission records.
Open-source libraries: Leaflet, Chart.js, html2canvas, Font Awesome, Inter.
**AI disclosure:** AI coding assistants (Anthropic's Claude) were used during development for code generation, debugging and documentation.
The team directed the design, tested the application and is responsible for the submission.

## What we would do next
Replace approximate target positions with surveyed MSL localisation data · interpret hazards from HiRISE and add DTM-based roughness ·
CTX/HiRISE basemaps · CRISM mineral layer · live REMS weather and a space-weather feed · validated vehicle profiles (real rover and suit data) · point-of-view imagery at each target.
