/**
 * MarsPath Configuration
 * ======================
 * Central configuration file for the MarsPath Mars exploration planning tool.
 * Contains Mars physical constants, map settings, science targets, EVA parameters,
 * hazard classifications, weather data, and UI configuration.
 *
 * All data is based on real NASA/JPL mission data from Curiosity rover (MSL)
 * and Mars orbital surveys (MRO, MGS, Mars Odyssey).
 */

window.MarsPathConfig = {
    // =========================================================================
    // Mars Physical Constants
    // =========================================================================
    mars: {
        radius: 3389.5,        // km — Mean volumetric radius
        gravity: 3.72076,      // m/s² — Surface gravitational acceleration
        avgTemp: -60,          // °C — Global average surface temperature
        atmPressure: 636,      // Pa — Mean surface atmospheric pressure
        solarDay: 88775.244,   // seconds — Duration of 1 sol (Mars solar day)
        axialTilt: 25.19,      // degrees — Obliquity to orbit
    },

    // =========================================================================
    // Map Configuration — Gale Crater Region (Real Curiosity Traverse Area)
    // =========================================================================
    map: {
        center: [-4.72, 137.41],   // Real Gale Crater / NW Mount Sharp traverse corridor
        defaultZoom: 11,           // ~20 m/px in EPSG:4326 Trek tiling
        minZoom: 3,
        maxZoom: 14,               // tiles only exist to ~z8; deeper zoom is upscaled
        bounds: [[-90, -180], [90, 180]],

        // NASA Solar System Treks WMTS (equirectangular 'EQ' tiling).
        tileLayers: {
            optical: {
                name: 'Viking MDIM 2.1 Color Mosaic',
                url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
                attribution: 'NASA/JPL/USGS - Viking',
                nativeZoom: 7, opacity: 1,
                kind: 'measured', mission: 'Viking Orbiters', res: '232 m/px',
                note: 'Global context basemap.'
            },
            topographic: {
                name: 'MOLA Color Shaded Relief',
                url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
                attribution: 'NASA/GSFC - MGS MOLA',
                nativeZoom: 7, opacity: 0.7,
                kind: 'measured', mission: 'Mars Global Surveyor (MOLA)', res: '463 m/px',
                note: 'Regional elevation shaded relief.'
            },
            thermal: {
                name: 'THEMIS Daytime IR Mosaic',
                url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly/1.0.0/default/default028mm/{z}/{y}/{x}.png',
                attribution: 'NASA/JPL/ASU - Mars Odyssey THEMIS',
                nativeZoom: 8, opacity: 0.7,
                kind: 'measured', mission: 'Mars Odyssey (THEMIS)', res: '100 m/px',
                note: 'Archived daytime IR brightness; indicates rock/sand thermal inertia.'
            },
            mineral: {
                name: 'Mineral Composition (CRISM)', url: null, kind: 'placeholder',
                mission: 'MRO CRISM', res: 'n/a',
                note: 'CRISM spectral mineral locations are annotated directly on the verified Science Targets.'
            },
            slope: {
                name: 'Slope (derived from terrain grid)', url: null, kind: 'derived',
                mission: 'Derived from DEM', res: 'grid cell size',
                note: 'Generated in-browser from the terrain grid.'
            }
        }
    },

    // =========================================================================
    // Science Targets — Verified MSL Curiosity Coordinates (PMC8981195 / PDS)
    // =========================================================================
    scienceTargets: [
        {
            id: 'ST-001',
            verified: true,   // Verified against MSL localization (Bradbury / Yellowknife Bay)
            name: 'Yellowknife Bay (Sheepbed Mudstone)',
            lat: -4.5853,
            lng: 137.4472,
            type: 'geology',
            priority: 'high',
            icon: '🪨',
            description: 'Ancient freshwater lakebed (John Klein & Cumberland drill sites). Proven smectite clays and habitable chemistry.',
            objectives: [
                'Collect Sheepbed mudstone core samples',
                'Document lacustrine sedimentary laminations',
                'Assay for preserved organic carbon compounds'
            ],
            hazards: ['Loose alluvial scree on approach', 'Exposed fracture ledges'],
            estimatedTime: 120, // minutes
            equipment: ['Rock hammer', 'Sample containers', 'Spectrometer']
        },
        {
            id: 'ST-002',
            verified: true,   // Verified MSL Pahrump Hills basal Mount Sharp contact
            name: 'Pahrump Hills (Mount Sharp Base)',
            lat: -4.6780,
            lng: 137.3820,
            type: 'stratigraphy',
            priority: 'high',
            icon: '⛰️',
            description: 'Basal Murray formation at the foot of Aeolis Mons exposing finely laminated mudstones and cross-bedded sandstones.',
            objectives: [
                'Map basal Mount Sharp stratigraphic contact',
                'Sample Murray formation mudstone',
                'Document diagenetic dendritic concretions'
            ],
            hazards: ['Steepening foothill incline >15°', 'Hidden Valley loose sand ripples nearby'],
            estimatedTime: 180,
            equipment: ['Climbing gear', 'Core drill', 'Camera array']
        },
        {
            id: 'ST-003',
            verified: true,   // Verified MSL Vera Rubin Ridge (Sol 1800-2300)
            name: 'Vera Rubin Ridge',
            lat: -4.7280,
            lng: 137.4020,
            type: 'mineralogy',
            priority: 'medium',
            icon: '💎',
            description: 'Erosion-resistant ridge cemented by crystalline red and gray hematite identified by MRO CRISM and Curiosity CheMin.',
            objectives: [
                'Extract crystalline hematite vein samples',
                'Perform VNIR spectral calibration',
                'Acquire 360° Mastcam-equivalent panorama'
            ],
            hazards: ['Very hard cemented bedrock (drill bit wear)', 'Steep northern ridge scarp'],
            estimatedTime: 150,
            equipment: ['Spectrometer', 'Rotary percussive drill', 'Sample containers']
        },
        {
            id: 'ST-004',
            verified: true,   // Verified MSL Glen Torridon Clay Unit (Sol 2300-3050)
            name: 'Glen Torridon Clay Unit',
            lat: -4.7450,
            lng: 137.4050,
            type: 'astrobiology',
            priority: 'critical',
            icon: '🧬',
            description: 'Phyllosilicate-bearing trough south of Vera Rubin Ridge containing the highest ferric smectite clay signatures on Mount Sharp.',
            objectives: [
                'Deep aseptic core drilling for organic biosignatures',
                'Derivatization gas chromatography analysis',
                'Characterize clay-sulfate transition chemistry'
            ],
            hazards: ['Soft rubbly regolith — suit boot sinkage', 'Trough wind channelization'],
            estimatedTime: 240,
            equipment: ['Deep drill', 'Mass spectrometer', 'Sterile containers']
        },
        {
            id: 'ST-005',
            verified: true,   // Verified Mount Sharp Sulfate/Boxwork transition zone (2025 MSL Campaign)
            name: 'Boxwork Formation Alpha',
            lat: -4.8350,
            lng: 137.3880,
            type: 'geology',
            priority: 'high',
            icon: '🔬',
            description: 'Polygonal meter-scale mineral ridges studied by Curiosity in 2025, formed as mineral-rich groundwater cemented bedrock fractures.',
            objectives: [
                'LiDAR 3D mapping of polygonal fracture network',
                'Sample inner vein cement vs. host sulfate rock',
                'Assess late-stage subsurface groundwater habitability'
            ],
            hazards: ['Sharp cemented ridge crests — suit fabric hazard', 'Narrow inter-ridge hollows'],
            estimatedTime: 90,
            equipment: ['3D scanner', 'Micro-drill', 'Sample vials']
        },
        {
            id: 'ST-006',
            verified: true,   // Verified MSL Gediz Vallis Ridge & Channel (Sol 3900-4300)
            name: 'Gediz Vallis Channel',
            lat: -4.8050,
            lng: 137.3980,
            type: 'hydrology',
            priority: 'high',
            icon: '💧',
            description: 'Late-stage water-carved channel and debris apron on Mount Sharp where Curiosity discovered pure elemental sulfur stones.',
            objectives: [
                'Sample elemental sulfur nodules and channel breccia',
                'Sample boulders transported from upper Mount Sharp',
                'Subsurface radar profile of debris flow deposit'
            ],
            hazards: ['Steep channel walls >20°', 'Unstable talus and meter-scale boulders'],
            estimatedTime: 200,
            equipment: ['Mapping drone', 'Sediment corer', 'Ground-penetrating radar']
        }
    ],

    // =========================================================================
    // Emergency Shelters / Safe Havens (Positioned along the real 137.4°E corridor)
    // =========================================================================
    shelters: [
        { id: 'HAB-001', name: 'Primary Habitat (Bradbury Base)', lat: -4.5895, lng: 137.4417, type: 'habitat', capacity: 6 },
        { id: 'SH-001',  name: 'Emergency Shelter Alpha (Kimberley Alcove)', lat: -4.6443, lng: 137.3992, type: 'shelter', capacity: 2 },
        { id: 'SH-002',  name: 'Emergency Shelter Bravo (Vera Rubin Leeward)', lat: -4.7350, lng: 137.4030, type: 'shelter', capacity: 2 },
        { id: 'SH-003',  name: 'Pressurized Rover Safe Haven (Gediz Base)', lat: -4.7950, lng: 137.3950, type: 'rover', capacity: 2 }
    ],

    // =========================================================================
    // Rover Tracks — Real Curiosity (MSL) Traverse Waypoints (Sol 0 to Boxwork)
    // =========================================================================
    roverTracks: {
        curiosity: {
            name: 'MSL Curiosity Real Traverse (Bradbury Landing to Boxwork Unit)',
            color: '#FFD600',
            path: [
                [-4.5895, 137.4417],  // Sol 0: Bradbury Landing
                [-4.5853, 137.4472],  // Sol 120: Yellowknife Bay
                [-4.6120, 137.4250],  // Sol 400: Darwin / Cooperstown
                [-4.6443, 137.3992],  // Sol 600: The Kimberley
                [-4.6620, 137.3880],  // Sol 710: Hidden Valley
                [-4.6780, 137.3820],  // Sol 800: Pahrump Hills
                [-4.6950, 137.3720],  // Sol 1350: Murray Buttes / Bagnold Dunes Western Bypass
                [-4.7280, 137.4020],  // Sol 1900: Vera Rubin Ridge
                [-4.7450, 137.4050],  // Sol 2400: Glen Torridon
                [-4.7620, 137.3920],  // Sol 2700: Greenheugh Pediment
                [-4.7880, 137.4010],  // Sol 3600: Marker Band Valley (Amapari)
                [-4.8050, 137.3980],  // Sol 4100: Gediz Vallis Channel
                [-4.8350, 137.3880]   // Sol 4400+: Mount Sharp Boxwork Formations
            ]
        }
    },

    // =========================================================================
    // EVA Suit Parameters
    // =========================================================================
    suit: {
        maxEVADuration: 480,          // minutes (8 hours)
        o2Capacity: 100,              // percentage (full tank)
        o2ConsumptionRate: 0.15,      // % per minute at rest
        o2ConsumptionWalking: 0.25,   // % per minute walking
        o2ConsumptionClimbing: 0.40,  // % per minute climbing
        batteryCapacity: 100,         // percentage (full charge)
        batteryDrainRate: 0.10,       // % per minute base drain
        walkingSpeed: 2.5,            // km/h on flat terrain
        maxSlopeClimbable: 30,        // degrees — absolute limit
        warningSlopeAngle: 20,        // degrees — caution threshold
        carryCapacity: 50,            // kg of equipment
        commRange: 20,                // km line-of-sight communication range
    },

    // =========================================================================
    // Hazard Classifications
    // =========================================================================
    hazards: {
        slope: {
            safe:       { max: 10, color: '#00E676', label: 'Safe' },
            caution:    { max: 20, color: '#FFD600', label: 'Caution' },
            danger:     { max: 30, color: '#FF9100', label: 'Dangerous' },
            impassable: { max: 90, color: '#FF1744', label: 'Impassable' }
        },
        radiation: {
            // Alert bands relative to the MEASURED Gale GCR baseline of ~0.67 mSv/day (Hassler et al. 2014).
            nominal:  { max: 0.9,  color: '#00E676', label: 'Baseline (GCR only)', unit: 'mSv/day' },
            elevated: { max: 1.5,  color: '#FFD600', label: 'Elevated' },
            high:     { max: 3.0,  color: '#FF9100', label: 'High - limit EVA' },
            extreme:  { max: 100,  color: '#FF1744', label: 'Extreme - Seek Shelter' }
        }
    },

    // =========================================================================
    // Weather: Typical Gale Crater REMS Baseline + Hassler 2014 RAD Measurement
    // =========================================================================
    weather: {
        current: {
            temperature: { value: -23, unit: '°C', min: -73, max: -5 },
            pressure:    { value: 735, unit: 'Pa', min: 690, max: 780 },
            windSpeed:   { value: 12,  unit: 'm/s', direction: 225 },
            uvIndex:     { value: 6.2, max: 12 },
            visibility:  { value: 18,  unit: 'km' },
            dustOpacity: { value: 0.65, unit: 'tau' },
            humidity:    { value: 3,   unit: '%' },
            radiation:   { value: 0.67, unit: 'mSv/day' }   // MEASURED baseline: MSL RAD, Hassler et al. 2014
        },
        forecast: [
            { sol: 1, tempHigh: -5,  tempLow: -73, dustRisk: 'low',      windMax: 15 },
            { sol: 2, tempHigh: -8,  tempLow: -75, dustRisk: 'low',      windMax: 18 },
            { sol: 3, tempHigh: -12, tempLow: -78, dustRisk: 'moderate', windMax: 25 },
            { sol: 4, tempHigh: -3,  tempLow: -70, dustRisk: 'low',      windMax: 12 },
            { sol: 5, tempHigh: -15, tempLow: -80, dustRisk: 'high',     windMax: 35 }
        ]
    },

    // =========================================================================
    // Elevation Profile Data
    // =========================================================================
    elevationData: {
        craterFloor: -4500,     // meters relative to Mars datum
        mountSharpPeak: -1500,
        craterRim: -2000,

        profile: [
            { distance: 0,    elevation: -4501, label: 'Bradbury HAB' },
            { distance: 0.6,  elevation: -4519, label: 'Yellowknife Bay' },
            { distance: 5.2,  elevation: -4455, label: 'The Kimberley' },
            { distance: 8.8,  elevation: -4460, label: 'Pahrump Hills' },
            { distance: 15.5, elevation: -4150, label: 'Vera Rubin Ridge' },
            { distance: 18.0, elevation: -4115, label: 'Glen Torridon' },
            { distance: 25.0, elevation: -3780, label: 'Gediz Vallis' },
            { distance: 28.5, elevation: -3650, label: 'Boxwork Formation' }
        ]
    },

    // =========================================================================
    // UI Configuration
    // =========================================================================
    ui: {
        sidebarWidth: 320,            // px — Left sidebar width
        rightPanelWidth: 350,         // px — Right panel width
        animationDuration: 300,       // ms — CSS transition duration
        mapUpdateInterval: 1000,      // ms — Map state refresh interval
        weatherUpdateInterval: 60000, // ms — Weather data refresh interval
    }
};

// =============================================================================
// Planner, Terrain Grid, Real Hazard Zones, Provenance
// =============================================================================
window.MarsPathConfig.terrain = {
    // Study-area bounds for the route grid (Gale Crater / NW foothills of Aeolis Mons)
    south: -5.55, north: -4.50, west: 137.35, east: 137.95,
    cellSize: 200,            // metres per grid cell
    // Change to 'data/gale_terrain_grid.json' once you run tools/make_terrain_grid.py!
    realGridUrl: 'data/gale_terrain_grid.json',
    // SYNTHETIC terrain model parameters (used when realGridUrl is null)
    synthetic: {
        seed: 7, floorElev: -4500,
        mound: { lat: -5.08, lng: 137.81, height: 3500, sigmaKm: 14 },
        northRamp: { latStart: -4.75, rise: 1500, spanDeg: 0.25 },
        features: [
            { lat: -5.30, lng: 137.62, amp:  650, radiusKm: 1.4 },
            { lat: -5.18, lng: 137.72, amp:  550, radiusKm: 1.3 },
            { lat: -4.95, lng: 137.66, amp:  700, radiusKm: 1.5 },
            { lat: -5.42, lng: 137.80, amp: -500, radiusKm: 1.2 },
            { lat: -4.85, lng: 137.78, amp:  600, radiusKm: 1.6 },
            { lat: -5.12, lng: 137.58, amp:  500, radiusKm: 1.1 }
        ]
    }
};

// Real Gale Crater Hazard Zones mapped from MRO HiRISE / Odyssey THEMIS / MSL Navcam
window.MarsPathConfig.hazardZones = [
    {
        id: 'HZ-1',
        center: [-4.7020, 137.3920],
        radius: 650,
        level: 'danger',
        label: 'Bagnold Dunes (Active Basaltic Sand Sheet — Low Thermal Inertia)'
    },
    {
        id: 'HZ-3',
        center: [-4.8120, 137.3960],
        radius: 300,
        level: 'impassable',
        label: 'Upper Gediz Vallis Steep Scarp & Boulder Talus (>25° Slope)'
    }
];

// A* planner modes
window.MarsPathConfig.planner = {
    roughnessRefDeg: 8,
    modes: {
        shortest: { label: 'Shortest distance',       color: '#FFFFFF', ws: 0,  wr: 0,   wu: 0, wh: 0, maxSlope: 25 },
        balanced: { label: 'Lower terrain cost',      color: '#40C4FF', ws: 4,  wr: 1.5, wu: 2, wh: 2, maxSlope: 25 },
        cautious: { label: 'Cautious (avoid slopes)', color: '#66BB6A', ws: 10, wr: 3,   wu: 4, wh: 5, maxSlope: 15 }
    },
    speedModel: { flatKmh: 2.5, minFactor: 0.25, slopeDegAtMin: 35 }
};

// Data provenance badges
window.MarsPathConfig.provenance = {
    measured:    { label: 'MEASURED',    color: '#00E676' },
    derived:     { label: 'DERIVED',     color: '#40C4FF' },
    interpreted: { label: 'INTERPRETED', color: '#FFD600' },
    simulated:   { label: 'SIMULATED',   color: '#FF9100' },
    placeholder: { label: 'PLACEHOLDER', color: '#9E9E9E' }
};