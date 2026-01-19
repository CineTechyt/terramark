import { useEffect, useRef, useState } from "react";
import { Backdrop, CircularProgress, Stack, Typography, Box } from "@mui/material";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getLocations, type LocationItem } from "../utils/storage";

const MAPBOX_TOKEN =
  "pk.eyJ1IjoiY2luZXRlY2giLCJhIjoiY21odzh6aDZ4MDF3azJqcjIwNGFidm50eSJ9.ljCtSMpyyfpyQ4hwIRnaMA";
mapboxgl.accessToken = MAPBOX_TOKEN;
const baseUrl = import.meta.env.BASE_URL || '/';

/* ...existing helper booleanPointInPolygon (unchanged) ... */
function booleanPointInPolygon(featureOrGeom: any, polyFeatureOrGeom: any): boolean {
  if (!featureOrGeom) return false;
  if (!polyFeatureOrGeom) return false;

  const getPointCoords = (f: any) => {
    if (f.type === "Feature") return f.geometry?.coordinates;
    if (f.type === "Point") return f.coordinates;
    if (f.type === "GeometryCollection") return null;
    return f.coordinates;
  };

  const pt = getPointCoords(featureOrGeom);
  if (!pt || pt.length < 2) return false;
  const x = pt[0], y = pt[1];

  const geom = polyFeatureOrGeom.type === "Feature" ? polyFeatureOrGeom.geometry : polyFeatureOrGeom;
  if (!geom) return false;

  const pointInRing = (lng: number, lat: number, ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const polygonContains = (lng: number, lat: number, polygonCoords: any[][]) => {
    if (!polygonCoords || polygonCoords.length === 0) return false;
    const outer = polygonCoords[0];
    if (!pointInRing(lng, lat, outer)) return false;
    for (let i = 1; i < polygonCoords.length; i++) {
      if (pointInRing(lng, lat, polygonCoords[i])) return false;
    }
    return true;
  };

  if (geom.type === "Polygon") {
    return polygonContains(x, y, geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    for (const polyCoords of geom.coordinates) {
      if (polygonContains(x, y, polyCoords)) return true;
    }
    return false;
  }

  return false;
}

interface Props {
  data?: any;
  highlight?: boolean;
  cities?: boolean;
  city?: boolean;
  highlightGeojsonUrl?: string;
  countriesGeojsonUrl?: string;
  selectedLocation?: LocationItem | null;
  citiesFileUrl?: string;
  height?: string | number;
}

export default function WorldMap({
  highlight = false,
  cities = false,
  city = false,
  countriesGeojsonUrl = `${baseUrl}countries.geojson`,
  selectedLocation = null,
  citiesFileUrl = `${baseUrl}cities15000.txt`,
  data = undefined,
  height = "100vh",
}: Props) {
  const showCities = Boolean(cities) || Boolean(city);

  // show intro only when we have data/highlight/cities
  const shouldShowIntro = Boolean(data) || Boolean(highlight) || showCities;
  const [showIntro, setShowIntro] = useState(shouldShowIntro);
  useEffect(() => {
    if (!shouldShowIntro) return;
    const t = window.setTimeout(() => setShowIntro(false), 10000);
    return () => clearTimeout(t);
  }, [shouldShowIntro]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);

  // safe remove helper
  const safeRemove = (layerId: string, srcId: string) => {
    if (!map.current) return;
    try { if (map.current.getLayer(layerId)) map.current.removeLayer(layerId); } catch {}
    try { if (map.current.getSource(srcId)) map.current.removeSource(srcId); } catch {}
  };

  // init map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 20],
      zoom: 1.5,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-left");
    return () => {
      try { map.current?.remove(); } catch {}
      map.current = null;
    };
  }, []);


  // ---------- HIGHLIGHT EFFECT: highlight visited countries based on points ----------
  useEffect(() => {
    if (!map.current) return;
    let cancelled = false;
    const srcId = "wm-highlight-src";
    const fillLayer = "wm-highlight-fill";
    const lineLayer = "wm-highlight-line";

    const loadAndHighlight = async () => {
      if (!highlight) {
        safeRemove(fillLayer, srcId);
        safeRemove(lineLayer, srcId);
        return;
      }

      try {
        // Get points from localStorage instead of fetching
        const ptsRaw = getLocations();
        const points = ptsRaw.map((o: LocationItem) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [o.lng, o.lat] },
          properties: o,
        }));

        // fetch countries polygons
        const cr = await fetch(countriesGeojsonUrl);
        if (!cr.ok) throw new Error("Failed to fetch countries");
        const countries = await cr.json();
        if (!countries || !countries.type || countries.type !== "FeatureCollection") {
          throw new Error("Invalid countries geojson");
        }

        // find countries that have at least one point
        const matched: any[] = [];
        for (const country of countries.features) {
          const gtype = country?.geometry?.type;
          if (gtype !== "Polygon" && gtype !== "MultiPolygon") continue;
          const hasPoint = points.some((pt: any) => booleanPointInPolygon(pt, country));
          if (hasPoint) matched.push(country);
        }

        if (cancelled || !map.current) return;

        // cleanup
        safeRemove(fillLayer, srcId);
        safeRemove(lineLayer, srcId);

        map.current.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: matched } });
        map.current.addLayer({ id: fillLayer, type: "fill", source: srcId, paint: { "fill-color": "#1976d2", "fill-opacity": 0.35 } });
        map.current.addLayer({ id: lineLayer, type: "line", source: srcId, paint: { "line-color": "#155fa0", "line-width": 1.5 } });

        // fit bounds if desired
        try {
          if (matched.length) {
            const bounds = new mapboxgl.LngLatBounds();
            for (const ft of matched) {
              if (ft.bbox) {
                bounds.extend([ft.bbox[0], ft.bbox[1]]).extend([ft.bbox[2], ft.bbox[3]]);
              } else if (ft.geometry && ft.geometry.type === "Polygon") {
                const coord = ft.geometry.coordinates?.[0]?.[0];
                if (coord) bounds.extend([coord[0], coord[1]]);
              }
            }
            if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 40, maxZoom: 6 });
          }
        } catch {}
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Highlight load failed:", err);
      }
    };

    loadAndHighlight();
    return () => {
      cancelled = true;
      safeRemove(fillLayer, srcId);
      safeRemove(lineLayer, srcId);
    };
  }, [highlight, countriesGeojsonUrl]);

  // ---------- CITIES EFFECT: aggregate by city and render markers ----------
  useEffect(() => {
    if (!map.current) return;
    if (!showCities) {
      safeRemove("wm-city-circle", "wm-city-src");
      return;
    }

    let cancelled = false;
    const srcId = "wm-city-src";
    const circleLayer = "wm-city-circle";

    const buildAndShowCities = async () => {
      try {
        // Get locations from localStorage instead of fetching
        const raw = getLocations();

        // normalize points
        const points = raw.map((o: LocationItem) => ({
          lat: o.lat,
          lng: o.lng,
          timestamp: o.timestamp,
          city: o.city ?? "",
        }));

        // group by city name
        // Count visits only when the city changes in chronological order.
        // First, sort points by timestamp ascending (fallback to index order if missing).
        const ptsWithTs = points
          .map((p, idx) => ({ ...p, _ts: Number(p.timestamp) || 0, _idx: idx }))
          .sort((a, b) => a._ts - b._ts || a._idx - b._idx);

        const cityMap = new Map<
          string,
          { sumLat: number; sumLng: number; count: number; visits: number; lastTs: number }
        >();

        let lastCity: string | null = null;
        for (const p of ptsWithTs) {
          const cityName = (p.city ?? "").toString().trim();
          if (!cityName) {
            // visiting an unnamed point counts as moving away from lastCity
            lastCity = null;
            continue;
          }

          const ts = Number(p.timestamp) || 0;
          let entry = cityMap.get(cityName);
          if (!entry) entry = { sumLat: 0, sumLng: 0, count: 0, visits: 0, lastTs: 0 };

          // If this point's city differs from the previous recorded city, this marks a (new) visit
          if (cityName !== lastCity) {
            entry.visits = (entry.visits || 0) + 1;
            lastCity = cityName;
          }

          // accumulate coords & last timestamp
          entry.sumLat += Number(p.lat) || 0;
          entry.sumLng += Number(p.lng) || 0;
          entry.count += 1;
          if (ts && (!entry.lastTs || ts > entry.lastTs)) entry.lastTs = ts;
          cityMap.set(cityName, entry);
        }

        // attempt to load cities15000.txt to get canonical coordinates
        // Build a name -> candidates[] map from cities15000.txt (GeoNames).
        // Each candidate includes lat/lng and basic admin/country info from columns.
        const citiesByName = new Map<
          string,
          Array<{ name: string; lat: number; lng: number; country?: string; admin1?: string }>
        >();
        try {
          const cr = await fetch(citiesFileUrl);
          if (cr.ok) {
            const txt = await cr.text();
            const lines = txt.split(/\r?\n/);
            for (const ln of lines) {
              if (!ln) continue;
              const cols = ln.split("\t");
              // GeoNames cities file columns: 0=id,1=name,2,3,4=lat,5=lon,...,8=country code,10=admin1 code
              if (cols.length < 6) continue;
              const name = (cols[1] || "").trim();
              const lat = Number(cols[4]);
              const lon = Number(cols[5]);
              const country = (cols[8] || "").trim();
              const admin1 = (cols[10] || "").trim();
              if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;
              const key = name.toLowerCase();
              const list = citiesByName.get(key) || [];
              list.push({ name, lat, lng: lon, country, admin1 });
              citiesByName.set(key, list);
            }
          }
        } catch (e) {
          // ignore file parse errors; we'll use averaged coords
        }

        // small helper: haversine distance in kilometers
        const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371.0088;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        // build features
        const outFeatures: any[] = [];
        for (const [cityName, v] of cityMap) {
          if (cancelled) return;
          const avgLat = v.sumLat / v.count;
          const avgLng = v.sumLng / v.count;
          // disambiguate by proximity: find candidates with same name and pick nearest to averaged coords
          let lat = avgLat;
          let lng = avgLng;
          const candidates = citiesByName.get(cityName.toLowerCase()) || [];
          if (candidates.length > 0) {
            let best = candidates[0];
            let bestDist = haversineKm(avgLat, avgLng, best.lat, best.lng);
            for (let i = 1; i < candidates.length; i++) {
              const c = candidates[i];
              const d = haversineKm(avgLat, avgLng, c.lat, c.lng);
              if (d < bestDist) {
                bestDist = d;
                best = c;
              }
            }
            // accept candidate if reasonably close (e.g. 200 km), otherwise fallback to averaged coords
            if (bestDist <= 200) {
              lat = best.lat;
              lng = best.lng;
            }
          }
          outFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              city: cityName,
              visits: v.visits,
              lastVisitedTs: v.lastTs || null,
              // optionally include disambiguation metadata for debugging
              _resolved_from_lookup: candidates.length > 0,
            },
          });
        }

        if (cancelled || !map.current) return;

        // cleanup existing
        safeRemove(circleLayer, srcId);

        map.current.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: outFeatures } });

        map.current.addLayer({
          id: circleLayer,
          type: "circle",
          source: srcId,
          paint: {
            "circle-radius": 7,
            "circle-color": "#ff5722",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
          },
        });

        // hover popup
        const onEnter = (e: any) => {
          if (!map.current) return;
          map.current.getCanvas().style.cursor = "pointer";
          const feat = e.features && e.features[0];
          if (!feat) return;
          const coords = feat.geometry.coordinates.slice();
          const props = feat.properties ?? {};
          const last = props.lastVisitedTs ? new Date(Number(props.lastVisitedTs)).toLocaleString() : "unknown";
          const visits = props.visits ?? 0;
          const html = `<div style="min-width:160px"><strong>${props.city}</strong><br/>Last: ${last}<br/>Visits: ${visits}</div>`;
          if (hoverPopupRef.current) hoverPopupRef.current.remove();
          hoverPopupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: false }).setLngLat(coords).setHTML(html).addTo(map.current);
        };
        const onLeave = () => {
          if (!map.current) return;
          map.current.getCanvas().style.cursor = "";
          if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
        };
        map.current.on("mouseenter", circleLayer, onEnter);
        map.current.on("mouseleave", circleLayer, onLeave);
        map.current.on("click", circleLayer, (e: any) => {
          const feat = e.features && e.features[0];
          if (!feat) return;
          const coords = feat.geometry.coordinates.slice();
          const props = feat.properties ?? {};
          const last = props.lastVisitedTs ? new Date(Number(props.lastVisitedTs)).toLocaleString() : "unknown";
          const visits = props.visits ?? 0;
          const html = `<div style="min-width:220px"><strong>${props.city}</strong><br/>Last: ${last}<br/>Visits: ${visits}</div>`;
          new mapboxgl.Popup({ offset: 12 }).setLngLat(coords).setHTML(html).addTo(map.current!);
        });

        // adjust viewport to show city pins if none selected
        if (outFeatures.length) {
          try {
            const bounds = new mapboxgl.LngLatBounds();
            for (const ft of outFeatures) {
              const [lng, lat] = ft.geometry.coordinates;
              bounds.extend([lng, lat]);
            }
            if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 40, maxZoom: 12 });
          } catch {}
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Could not load cities:", err);
      }
    };

    buildAndShowCities();

    return () => {
      cancelled = true;
      safeRemove(circleLayer, srcId);
      try {
        if (map.current) {
          map.current.off("mouseenter", circleLayer, () => {});
          map.current.off("mouseleave", circleLayer, () => {});
          map.current.off("click", circleLayer, () => {});
        }
      } catch {}
      if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    };
  }, [showCities, citiesFileUrl]);

  // ---------- SELECTED LOCATION marker (large) ----------
  useEffect(() => {
    if (!map.current) return;
    const mapRef = map.current;
    if (!selectedLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const { lat, lng } = selectedLocation;

    // create a larger DOM marker
    const el = document.createElement("div");
    el.style.width = "28px";
    el.style.height = "28px";
    el.style.borderRadius = "50%";
    el.style.background = "#ff5722";
    el.style.boxShadow = "0 0 0 6px rgba(255,87,34,0.15)";
    el.style.border = "2px solid white";

    if (userMarkerRef.current) {
      // Preserve existing popup (if any), remove old marker and recreate it with the new element
      const existingPopup = (userMarkerRef.current.getPopup && userMarkerRef.current.getPopup()) || null;
      try { userMarkerRef.current.remove(); } catch {}
      userMarkerRef.current = new mapboxgl.Marker({ element: el as HTMLElement, anchor: "center" })
        .setLngLat([lng, lat]);
      if (existingPopup) {
        userMarkerRef.current.setPopup(existingPopup);
      } else {
        userMarkerRef.current.setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>Saved location</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`));
      }
      userMarkerRef.current.addTo(mapRef);
    } else {
      userMarkerRef.current = new mapboxgl.Marker({ element: el as HTMLElement, anchor: "center" })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>Saved location</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`))
        .addTo(mapRef);
    }

    try {
      mapRef.flyTo({ center: [lng, lat], zoom: 8, speed: 1.2, curve: 1.4, essential: true });
    } catch {}

    return () => {
      // keep marker until changed/removed
    };
  }, [selectedLocation]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    };
  }, []);

  return (
    <Box sx={{ position: "relative", width: "100%", height: height }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      <Backdrop open={showIntro} sx={{ position: "absolute", inset: 0, zIndex: 9999, color: "#fff" }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography variant="h6">Loading map…</Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
}
