#!/usr/bin/env python3
"""
make_terrain_grid.py - turn a real Mars DEM (GeoTIFF, elevations in METRES) into the JSON grid that
MarsPath's route planner loads (js/terrain.js -> TerrainGrid.fromJSON).

Example (event day):
  pip install rasterio numpy
  python tools/make_terrain_grid.py gale_dem.tif --south -5.55 --north -4.50 --west 137.35 --east 137.95 \
      --cell 200 --source "MRO HiRISE/CTX DTM <product id>, NASA/USGS" --out data/gale_terrain_grid.json
Then in js/config.js set   terrain.realGridUrl = 'data/gale_terrain_grid.json'   and serve the folder over http
(e.g. `python -m http.server 8000`), because browsers block fetch() from file://.

Notes
 * Output grid is a regular lat/lng grid (row 0 = north) with cell size in metres ~ matching js/terrain.js.
 * Resampling is AVERAGE (downsampling a fine DEM to --cell). It never creates detail that isn't in the source.
 * Cells with no data become null -> the app treats them as "unknown" (penalised / optionally blocked).
 * Check units! MOLA/HiRISE DEMs are usually metres, but some products are scaled integers (see their label).
"""
import argparse, json, math, sys
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from rasterio.crs import CRS

MARS_R = 3389500.0      # must match js/terrain.js
DEG = math.pi / 180


def target_crs(src_crs):
    """Geographic CRS on the SAME Mars figure as the source (avoids an Earth/Mars datum mix-up)."""
    if src_crs is None:
        sys.exit("DEM has no CRS. Assign one first (gdal_edit.py -a_srs) - do NOT assume Earth WGS84.")
    if src_crs.is_geographic:
        return src_crs
    p = src_crs.to_proj4()
    toks = {t.lstrip('+').split('=')[0]: t.split('=')[1] for t in p.split() if '=' in t}
    if 'R' in toks:
        return CRS.from_proj4(f"+proj=longlat +R={toks['R']} +no_defs")
    if 'a' in toks and 'b' in toks:
        return CRS.from_proj4(f"+proj=longlat +a={toks['a']} +b={toks['b']} +no_defs")
    sys.exit(f"Cannot read the planetary radius from CRS: {p}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dem'); ap.add_argument('--south', type=float, required=True); ap.add_argument('--north', type=float, required=True)
    ap.add_argument('--west', type=float, required=True); ap.add_argument('--east', type=float, required=True)
    ap.add_argument('--cell', type=float, default=200.0, help='cell size in metres (default 200)')
    ap.add_argument('--source', default='unspecified DEM'); ap.add_argument('--out', default='data/gale_terrain_grid.json')
    ap.add_argument('--scale', type=float, default=1.0, help='multiply DEM values (e.g. 0.5 if stored in half-metres)')
    ap.add_argument('--offset', type=float, default=0.0, help='added after scaling')
    a = ap.parse_args()

    lat0 = (a.south + a.north) / 2
    dlat = a.cell / (MARS_R * DEG); dlon = a.cell / (MARS_R * DEG * math.cos(lat0 * DEG))
    nx = math.ceil((a.east - a.west) / dlon); ny = math.ceil((a.north - a.south) / dlat)
    dst_tf = from_origin(a.west, a.north, dlon, dlat)

    with rasterio.open(a.dem) as src:
        dst = np.full((ny, nx), np.nan, dtype='float32')
        reproject(source=rasterio.band(src, 1), destination=dst, src_transform=src.transform, src_crs=src.crs,
                  src_nodata=src.nodata, dst_transform=dst_tf, dst_crs=target_crs(src.crs), dst_nodata=np.nan,
                  resampling=Resampling.average)
        print(f"DEM: {src.width}x{src.height}px, CRS={src.crs.to_string()[:60]}..., nodata={src.nodata}")
    dst = dst * a.scale + a.offset

    valid = np.isfinite(dst)
    if not valid.any():
        sys.exit("No valid DEM cells inside the requested bounds - check coverage / longitude convention (0-360 vs -180..180).")
    lo, hi = float(np.nanmin(dst)), float(np.nanmax(dst))
    print(f"grid {nx}x{ny} @ {a.cell} m | valid {100*valid.mean():.1f}% | elevation {lo:.0f}..{hi:.0f} m")
    if hi - lo < 5 or hi - lo > 30000:
        print("WARNING: elevation range looks wrong - check units / --scale / --offset.")
    if valid.mean() < 0.9:
        print("WARNING: >10% no-data. Cells will be 'unknown' in the planner.")

    obj = {'meta': {'south': a.north - ny * dlat, 'north': a.north, 'west': a.west, 'east': a.west + nx * dlon,
                    'cellSize': a.cell, 'nx': nx, 'ny': ny, 'source': a.source, 'synthetic': False},
           'elevation': [None if not np.isfinite(v) else round(float(v), 1) for v in dst.ravel()]}
    import os; os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f: json.dump(obj, f, separators=(',', ':'))
    print('wrote', a.out, f'({os.path.getsize(a.out)/1e6:.2f} MB)')


if __name__ == '__main__':
    main()
