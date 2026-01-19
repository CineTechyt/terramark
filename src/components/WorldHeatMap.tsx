import { useEffect, useRef, useState } from "react";
import { Backdrop, CircularProgress, Stack, Typography, Box } from "@mui/material";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getLocations, type LocationItem } from "../utils/storage";

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2luZXRlY2giLCJhIjoiY21rbDV2eXppMDE5cDNrcjI1YXZhNGkwcSJ9.nh4PDmmLCTGM6bz5Upwa1g";
mapboxgl.accessToken = MAPBOX_TOKEN;

interface WorldHeatMapProps {
  height?: string | number;
}

export default function WorldHeatMap({ height = "100vh" }: WorldHeatMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    // Hide intro when map is loaded
    if (mapLoaded) {
      setShowIntro(false);
    }
  }, [mapLoaded]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Helper to convert LocationItem[] to GeoJSON FeatureCollection
  const locationsToGeoJSON = (locations: LocationItem[]): any => {
    return {
      type: "FeatureCollection",
      features: locations.map((loc) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [loc.lng, loc.lat],
        },
        properties: {
          timestamp: loc.timestamp,
          accuracy: loc.accuracy,
          city: loc.city,
        },
      })),
    };
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 20],
      zoom: 2,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      // Load initial data from localStorage
      const locations = getLocations();
      const geojsonData = locationsToGeoJSON(locations);

      map.addSource("earthquakes", {
        type: "geojson",
        data: geojsonData,
      });

      map.addLayer({
        id: "earthquakes-heat",
        type: "heatmap",
        source: "earthquakes",
        maxzoom: 20,
        paint: {
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 20, 5],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(209,229,240)",
            0.6, "rgb(253,219,199)",
            0.8, "rgb(239,138,98)",
            1, "rgb(178,24,43)"
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 10, 15],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 20, 1]
        }
      });

      // Fit map to show all points if any exist
      if (locations.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        locations.forEach((loc) => {
          bounds.extend([loc.lng, loc.lat]);
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
        }
      }
    });

    // Listen for dynamic updates
    const onLocationsUpdated = () => {
      const src = map.getSource("earthquakes") as mapboxgl.GeoJSONSource | undefined;
      const locations = getLocations();
      const newData = locationsToGeoJSON(locations);

      if (src && typeof src.setData === "function") {
        try {
          src.setData(newData);
        } catch (e) {
          console.error("Error updating heatmap data:", e);
        }
      }
    };

    window.addEventListener("locations-updated", onLocationsUpdated);

    return () => {
      window.removeEventListener("locations-updated", onLocationsUpdated);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapLoaded(false);
    };
  }, []);

  return (
    <Box sx={{ position: "relative", width: "100%", height: height }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      <Backdrop
        open={showIntro}
        sx={{ position: "absolute", inset: 0, zIndex: 9999, color: "#fff", display: "flex", flexDirection: "column" }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography variant="h6">Loading heatmap…</Typography>
          <Typography variant="body2">Preparing tiles and data — this may take a few seconds.</Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
}