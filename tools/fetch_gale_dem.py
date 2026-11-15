"""
Fetches ONLY the Gale Crater bounding box (-5.55 to -4.50 N, 137.35 to 137.95 E)
remotely over HTTP using GDAL/rasterio HTTP range requests (takes ~5 seconds)
and saves data/gale_dem.tif.
"""
import os
import sys
import numpy as np
import rasterio
from rasterio.windows import from_bounds

# Official USGS Astrogeology / NASA PDS Cloud-Optimized GeoTIFF for MOLA-HRSC Blended DEM 200m v2
# (If you copied a direct .tif URL from Mars Trek, you can also paste it as the first item here)
URLS = [
    "https://planetarymaps.usgs.gov/mosaic/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif",
    "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
]

# Gale Crater bounding box matching js/config.js
WEST, SOUTH, EAST, NORTH = 137.35, -5.55, 137.95, -4.50
OUT_TIF = os.path.join("data", "gale_dem.tif")

os.makedirs("data", exist_ok=True)

for url in URLS:
    print(f"Connecting to NASA/USGS server: {url} ...")
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open(url) as src:
                print("Connected! CRS:", src.crs, "Bounds:", src.bounds)
                
                # Check if raster is in degrees (-180..180) or meters (equirectangular projection)
                if abs(src.bounds.right) > 360:
                    # Equirectangular meters on Mars sphere (R = 3396190 m)
                    deg_to_m = (np.pi / 180.0) * 3396190.0
                    win = from_bounds(
                        WEST * deg_to_m, SOUTH * deg_to_m,
                        EAST * deg_to_m, NORTH * deg_to_m,
                        src.transform
                    )
                else:
                    win = from_bounds(WEST, SOUTH, EAST, NORTH, src.transform)

                win = win.round_offsets().round_lengths()
                print(f"Downloading only Gale Crater window ({int(win.width)}x{int(win.height)} pixels)...")
                data = src.read(1, window=win)

                # Save standard Lat/Lon GeoTIFF so make_terrain_grid.py reads it cleanly
                transform = rasterio.transform.from_bounds(WEST, SOUTH, EAST, NORTH, data.shape[1], data.shape[0])
                profile = src.profile.copy()
                profile.update({
                    "driver": "GTiff",
                    "height": data.shape[0],
                    "width": data.shape[1],
                    "count": 1,
                    "dtype": data.dtype,
                    "crs": "EPSG:4326",
                    "transform": transform
                })

                with rasterio.open(OUT_TIF, "w", **profile) as dst:
                    dst.write(data, 1)

                print(f"SUCCESS! Saved real NASA Gale Crater DEM to {OUT_TIF} (Elev range: {data.min()}m to {data.max()}m)")
                sys.exit(0)
    except Exception as e:
        print(f"URL failed ({e}), trying backup...")

print("Could not reach remote COG. Paste your browser's Download URL into URLS[0] and re-run.")
sys.exit(1)