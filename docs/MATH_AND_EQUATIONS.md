# MarsPath — Mathematics and Equations

Every equation used in the application, where it lives in the code, and whether it is a **standard formula**,
a **published relation**, or a **prototype assumption**. Symbols: φ latitude, λ east longitude, R Mars radius, z elevation (m), d distance (m).
(Equations use GitHub's LaTeX rendering.)

Constants: R = 3,389.5 km (mean radius; 3,389,500 m in the grid code) · g = 3.72076 m/s² · Mars sol = 1.0274912517 Earth days.

---

## 1. Geometry and the terrain grid — `js/terrain.js`, `tools/make_terrain_grid.py`

**1.1 Metres per degree** (`TerrainGrid` constructor) — *standard (equirectangular)*

$$m_{lat}=R\frac{\pi}{180},\qquad m_{lon}=R\frac{\pi}{180}\cos\varphi_0,\qquad \varphi_0=\tfrac{S+N}{2}$$

**1.2 Cell size in degrees and grid dimensions**

$$\Delta\varphi=\frac{c}{m_{lat}},\quad \Delta\lambda=\frac{c}{m_{lon}},\quad n_y=\left\lceil\frac{N-S}{\Delta\varphi}\right\rceil,\quad n_x=\left\lceil\frac{E-W}{\Delta\lambda}\right\rceil$$
with cell size *c* = 200 m. The Python tool uses the same formulas so the JSON grid matches the browser.

**1.3 Cell ↔ coordinate** (`cellToLatLng`, `latLngToCell`)

$$\varphi_{r}=N-(r+\tfrac12)\Delta\varphi,\quad \lambda_{c}=W+(c+\tfrac12)\Delta\lambda,\quad r=\left\lfloor\frac{N-\varphi}{\Delta\varphi}\right\rfloor,\; c=\left\lfloor\frac{\lambda-W}{\Delta\lambda}\right\rfloor$$

**1.4 Bilinear elevation** (`elevationAt`) — *standard*

$$z=(1-t_r)\big[(1-t_c)z_{00}+t_c z_{01}\big]+t_r\big[(1-t_c)z_{10}+t_c z_{11}\big]$$

**1.5 Slope — Horn's 3×3 method** (`computeDerived`) — *standard GIS method (Horn 1981)*
For the 3×3 neighbourhood
$\begin{smallmatrix}a&b&c\\d&\cdot&f\\g&h&k\end{smallmatrix}$:

$$\frac{\partial z}{\partial x}=\frac{(c+2f+k)-(a+2d+g)}{8\,c_s},\qquad \frac{\partial z}{\partial y}=\frac{(g+2h+k)-(a+2b+c)}{8\,c_s},\qquad \theta=\arctan\sqrt{\left(\tfrac{\partial z}{\partial x}\right)^2+\left(\tfrac{\partial z}{\partial y}\right)^2}$$
(c_s = cell size; θ converted to degrees.)

**1.6 Roughness proxy** (`computeDerived`, 5×5 window) — *prototype definition*
Standard deviation of slope in the window:

$$R_{raw}=\sqrt{\overline{\theta^2}-\overline{\theta}^{\,2}}$$

**1.7 Hazard-zone test** (`applyHazards`) — a cell is inside a circular zone if

$$\sqrt{(\Delta\lambda\, m_{lon})^2+(\Delta\varphi\, m_{lat})^2}\le r_{zone}$$
`danger` / `impassable` → hard no-go; `caution` → penalty term H = 1.

**1.8 Synthetic terrain (fallback only, not used with the real DEM)** — Gaussian mound
$z=z_0+H\,e^{-(d/\sigma)^2}$, smoothstep ramp $3u^2-2u^3$, and value noise.

---

## 2. Route planning — `js/pathfinding.js`

**2.1 Edge slope and hard limits** (`costModel`)

$$\theta_e=\arctan\frac{|\Delta z|}{d}\quad\text{edge forbidden if }\theta_e>\theta_{max}$$
A cell is also blocked if its Horn slope > θ_max, it lies in a no-go zone, or (optionally) has no data.

**2.2 Penalty terms**

$$S=\left(\frac{\theta_e}{\theta_{max}}\right)^2,\quad R=\min\!\left(1,\frac{(R_a+R_b)/2}{R_{ref}}\right),\quad U=\frac{u_a+u_b}{2},\quad H=\frac{h_a+h_b}{2}$$
R_ref = 8° (`planner.roughnessRefDeg`).

**2.3 Step cost** — the project's cost function (matches the plan's $C=d(1+w_sS+w_rR)$, extended)

$$C_{step}=d\,\bigl(1+w_sS+w_rR+w_uU+w_hH\bigr),\qquad d=\begin{cases}c_s&\text{orthogonal}\\ c_s\sqrt2&\text{diagonal}\end{cases}$$

| Mode | w_s | w_r | w_u | w_h | θ_max on foot | θ_max rover |
|---|---|---|---|---|---|---|
| Shortest | 0 | 0 | 0 | 0 | 25° | 20° |
| Lower terrain cost | 4 | 1.5 | 2 | 2 | 25° | 20° |
| Cautious | 10 | 3 | 4 | 5 | 15° | 12° |

(*prototype assumptions*, `config.js → planner.modes`, `mobility.js`).

**2.4 A\* search** (`search`)

$$f(n)=g(n)+h(n),\qquad g(n)=\sum C_{step}$$

**2.5 Heuristic — octile distance** (admissible because every penalty ≥ 0, so $C_{step}\ge d$)

$$h(n)=c_s\Bigl[(\Delta r+\Delta c)+(\sqrt2-2)\min(\Delta r,\Delta c)\Bigr]$$
Setting h = 0 gives Dijkstra, used in `tests/run-tests.js` to verify A\* returns the same optimal cost.

**2.6 No corner-cutting** — a diagonal move is allowed only if both orthogonal neighbours are traversable.

**2.7 Route statistics** (`summarize`)

$$D=\sum d_i,\qquad D_{3D}=\sum\sqrt{d_i^2+\Delta z_i^2},\qquad \text{gain}=\sum\max(\Delta z_i,0),\quad \text{loss}=\sum\max(-\Delta z_i,0)$$
Max slope = largest θ_e; p95 = sorted slope at index ⌊0.95 n⌋; "cost×" = ΣC_step / D.

**2.8 Travel-time model** — *prototype assumption*

$$v=v_{flat}\cdot\max\!\left(f_{min},\,1-\frac{\theta_e}{\theta_{v}}\right),\qquad t=\sum\frac{d_i/1000}{v_i}\cdot 60\ \text{min}$$
f_min = 0.25, θ_v = 35°; v_flat = 2.5 km/h on foot, 12 km/h (default) by rover.

**2.9 Mission time vs. budget** (`routing.js`, `report.js`)

$$T_{total}=t_{travel}+\sum t_{stop}\le T_{budget}\quad(480\text{ min on foot},\;600\text{ min rover})$$

**2.10 AUTO — stop-order optimisation** (`routing.js → optimizeOrder`)
Build the matrix $D_{ij}$ of A\* shortest distances between all waypoints, then choose the order of the middle stops π minimising

$$\min_{\pi}\; D_{0,\pi_1}+\sum_{k=1}^{m-1}D_{\pi_k,\pi_{k+1}}+D_{\pi_m,end}$$
Exhaustive over permutations for ≤ 7 middle stops; greedy nearest-neighbour above that.

**2.11 SCIENCE ROUTE** (`routing.js → scienceRoute`) — greedy: targets sorted by priority then distance; a target is added only if the planned $T_{total}\le T_{budget}$; stops ordered by nearest-neighbour (great-circle distance, §6.1).

**2.12 Hazard proximity** (`report.js → nearZones`)

$$\text{gap}=\min_{p\in\text{route}}\bigl\|p-c_{zone}\bigr\|-r_{zone};\qquad \text{inside if gap}\le0,\ \text{reported as "near" if gap}\le500\text{ m}$$

---

## 3. Travel modes — `js/mobility.js`

**3.1 Speed-dependent slope limit (rover)** — *prototype assumption*

$$f=\max\bigl(0.6,\;1-0.02\,\max(0,v-12)\bigr),\qquad \theta_{max}'=\operatorname{round}_{0.1}(\theta_{max}\cdot f)$$
Example: v = 20 km/h → f = 0.84 → 20° becomes 16.8°.

---

## 4. Rover resources — `js/resources.js`

Mass $m=m_{rover}+n\,m_{crew}$ (3500 kg + 100 kg per person), crew size *n* ∈ {1,2,3}, $T_{total}$ in hours.

**4.1 Effective rolling resistance (grows mildly with speed)**

$$c_{rr}'=c_{rr}\Bigl(1+0.5\,(v/20)^2\Bigr),\qquad c_{rr}=0.15$$

**4.2 Driving energy** — *standard work–energy, with assumed constants*

$$E_{drive}=\frac{m\,g\,\bigl(c_{rr}'\,D+\text{gain}\bigr)}{\eta\cdot 3.6\times10^{6}}\ \text{kWh},\qquad \eta=0.7,\ g=3.72076$$

**4.3 Hotel (life-support, thermal, avionics) energy**

$$E_{hotel}=(1.2+0.2\,n)\ \text{kW}\times T_{total},\qquad E=E_{drive}+E_{hotel},\qquad \text{battery}\%=100\,E/40\text{ kWh}$$

**4.4 Consumables**

$$X=\rho\,n\,T_{total},\qquad X\%=100\,X/M_{cap}$$
ρ = 0.035 kg/person·h O₂ (≈ 0.84 kg/day, a commonly cited design value — verify before quoting), 0.12 L/person·h water, 117 kcal/person·h food (≈ 2,800 kcal/day). In rover mode the **O₂ supply $M_{cap}$ (0.1–10 kg, default 5) and battery capacity $E_{cap}$ (5–100 kWh, default 40) are user-selected**. Water and food are shown against a fixed 3-crew × 48 h reserve.
Warnings: battery > 70 % ("under 30 % reserve"), > 100 % (infeasible), life-support > 70 % of supply.
All values are **prototype assumptions**.

**4.5 Consumption timeline and depletion point** (`resources.js → compute`, used by the route panel, report and HUD) — for every route step *i* of duration $t_i$ (minutes, from §2.8):

$$\text{Rover:}\quad \Delta B_i=100\,\frac{E_{drive,i}+P_{hotel}\,t_i/60}{E_{cap}},\qquad \Delta O_i=100\,\frac{\rho\,n\,t_i/60}{M_{cap}}$$
$$\text{On foot (fixed 100 % tanks):}\quad \Delta O_i=t_i\Bigl[r_w+(r_c-r_w)\,\operatorname{clamp}\!\bigl(\tfrac{\theta_i}{20^\circ},0,1\bigr)\Bigr],\qquad \Delta B_i=t_i\,r_b$$
with $r_w=0.25$, $r_c=0.40$ %/min (walking / climbing), $r_b=0.10$ %/min, and $0.15$ %/min O₂ while stationary (from `config.suit`, illustrative). Time spent on site at a stop adds a lump of consumption at that waypoint. Cumulative use and remaining supply:

$$A_i=\sum_{k\le i}\bigl(\Delta_k+\text{stop}_k\bigr),\qquad \text{remaining}_i=100-A_i\ \ (\text{allowed to go below }0)$$
The **failure point** is the first step where either resource reaches $A\ge100$; its position is interpolated inside that step:

$$f=\frac{100-A_{i-1}}{\Delta_i},\qquad d_{fail}=d_{i-1}+f\,(d_i-d_{i-1}),\qquad \text{share of route}=d_{fail}/D$$
(if the supply runs out during a stop, the failure point is that waypoint). In the HUD simulation the completed path is drawn green until the failure point and red afterwards, the failure point is highlighted, and the readouts keep counting below 0 to show the shortfall.

---

## 5. Environment panel — `js/weather.js`

**5.1 Gale local solar time** (`lmst`) — *published: Allison & McEwen (2000)*

$$JD=\frac{t_{unix,ms}}{86{,}400{,}000}+2440587.5,\quad JD_{TT}=JD+\frac{69.184}{86400}$$
$$MSD=\frac{JD_{TT}-2451549.5}{1.0274912517}+44796.0-0.0009626,\quad MTC=24\,\text{frac}(MSD),\quad LMST=\Bigl(MTC+\frac{\lambda}{15}\Bigr)\bmod24,\ \lambda=137.4^{\circ}E$$
During the HUD walk, simulated seconds are added to *t*, so Mars time advances with the mission clock.

**5.2 Map-area statistics** (`computeArea`) — for grid cells inside the current map view: mean elevation, mean slope, relief = z_max − z_min, sampled with stride $\lceil\sqrt{N/2000}\rceil$. Used only if the grid covers ≥ 25 % of the view; otherwise reference conditions are shown.

**5.3 Altitude offsets** — Δz = z_area − z_ref (z_ref = −4,500 m for typical values; −3,765 m approx. Curiosity elevation for live REMS values)

$$\Delta T=-2.5\,\frac{\Delta z}{1000}\ \text{°C}\ \ (\text{assumed lapse rate}),\qquad P_m=P_{ref}\,e^{-\Delta z/H},\quad H=\frac{R_sT}{g}\approx\frac{191.8\cdot210}{3.72}\approx10.8\ \text{km}$$
(the pressure relation is the standard isothermal barometric formula).

**5.4 Daily temperature shape** — *modelled*; minimum at 05:00, maximum at 13:30 local time, cosine ramps:

$$f(t)=\begin{cases}0.5-0.5\cos\!\Bigl(\pi\frac{t-5}{8.5}\Bigr)&5\le t\le13.5\\[2pt] 0.5+0.5\cos(\pi u),\ u=\dfrac{t'-13.5}{15.5}&\text{otherwise}\end{cases}\qquad T=T_{lo}+(T_{hi}-T_{lo})f(t)$$
where $T_{lo/hi}$ = REMS (or typical) daily min/max plus ΔT, and *t′* = *t* (if *t* > 13.5) or *t*+24.

**5.5 Daily pressure cycle** — *modelled*, ±6 %, lowest at 15:00

$$P=P_m-0.06\,P_m\cos\!\Bigl(\frac{2\pi(t-15)}{24}\Bigr)$$

**5.6 Wind** — *modelled*

$$\text{shape}=\max\!\bigl(0,\sin\tfrac{\pi(t-8)}{12}\bigr),\quad W=\bigl[2.5+6\,\text{shape}\bigr]\cdot w_f\ \ \text{or}\ \ W_{REMS}(0.6+0.8\,\text{shape})\,w_f,\quad w_f=1+0.05\,\bar\theta+0.10\max(0,\Delta z/1000)$$

**5.7 UV level** — $\text{sun}=\max\bigl(0,\cos\tfrac{2\pi(t-12.5)}{24}\bigr)$: NIGHT ≤ 0.02, LOW < 0.3, MODERATE < 0.65, otherwise the REMS (or typical) peak level.

**5.8 Radiation** — baseline measured by MSL RAD (Hassler et al. 2014, $D_0=0.67$ mSv/day); pressure sensitivity is an *assumption*:

$$D=D_0\Bigl[1-0.5\,\frac{P-P_{ref}}{P_{ref}}\Bigr]$$
Alert bands: ≤ 0.9 baseline, ≤ 1.5 elevated, ≤ 3.0 high, above extreme (illustrative). Bar width = min(100, D/3·100) %.

**5.9 Sensor-like variation** — $n_k(t)=0.5\sin\bigl(t_{ms}/(900+370k)+k\bigr)$, scaled ×1.4 °C, ×4 Pa, ×2 m/s, ×0.03 mSv/day.

---

## 6. Map, tools and HUD — `js/marsMap.js`, `js/ui.js`, `js/hud.js`

**6.1 Great-circle distance (haversine)** (`MarsMap.calculateDistance`) — *standard*

$$a=\sin^2\tfrac{\Delta\varphi}{2}+\cos\varphi_1\cos\varphi_2\sin^2\tfrac{\Delta\lambda}{2},\qquad d=2R\,\operatorname{atan2}\!\bigl(\sqrt a,\sqrt{1-a}\bigr)$$

**6.2 Spherical polygon area** (`ui.js → areaKm2`) — *standard (spherical-excess approximation)*

$$A=\frac{R^2}{2}\left|\sum_i(\lambda_{i+1}-\lambda_i)\bigl(2+\sin\varphi_i+\sin\varphi_{i+1}\bigr)\right|$$

**6.3 Bearing / heading** (`hud.js → bearing`)

$$\theta=\operatorname{atan2}\bigl(\sin\Delta\lambda\cos\varphi_2,\ \cos\varphi_1\sin\varphi_2-\sin\varphi_1\cos\varphi_2\cos\Delta\lambda\bigr)\bmod360^\circ$$

**6.4 Map scale** — Leaflet with an EPSG:4326 CRS and R = 3,389,500 m: the world is $512\cdot2^{z}$ px wide, so

$$\text{deg/px}=\frac{360}{512\cdot2^{z}},\qquad \text{m/px}=\text{deg/px}\cdot\frac{\pi R}{180}$$

**6.5 HUD walk** (`hud.js → tick`) — distance advances at the slope-adjusted speed with a 120× time-lapse (TL):

$$\text{dist}\mathrel{+}=\frac{v}{3.6}\,TL\,\Delta t,\qquad t_{mission}\mathrel{+}=TL\,\Delta t$$
Position is linearly interpolated between grid cells: $p=p_i+f\,(p_{i+1}-p_i)$, $f=\frac{\text{dist}-d_i}{d_{i+1}-d_i}$. Rover O₂/battery readouts: $100-\text{progress}\times\text{used}\%$ from §4.

---

## Summary of what is standard vs. assumed
| Category | Items |
|---|---|
| **Standard formulas** | metres/degree, bilinear interpolation, Horn slope, haversine, spherical polygon area, bearing, barometric formula, A\*/Dijkstra, work–energy |
| **Published relations / data** | LMST (Allison & McEwen 2000), radiation baseline (Hassler et al. 2014), Curiosity REMS daily range |
| **Prototype assumptions (adjustable in `config.js`, `mobility.js`, `resources.js`)** | cost weights, slope limits, speeds, time budgets, lapse rate, wind/radiation sensitivities, daily-cycle shapes, rover mass/efficiency/battery, consumption rates |
