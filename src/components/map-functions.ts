import { useEffect, useMemo, useState } from "react";
import * as turf from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";

type GeoFeature = {
  type: string;
  properties?: Record<string, any>;
  geometry?: { type: string; coordinates: number[] };
};
type CityBoundary = {
  name: string;
  // the polygon geometry
  polygon: Polygon | MultiPolygon;
};

type CitySummary = {
  key: string;
  name: string;
  visits: number;
  lastVisitedTs: number | null;
  visitTimestamps: number[];
  // representative coordinate (centroid for polygon cities, average for point clusters)
  lat: number | null;
  lng: number | null;
};

export default function useVisitedCitiesWithBoundaries(
  cityBoundaries: CityBoundary[]
) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/locations.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          const feats: GeoFeature[] = Array.isArray(data.features)
            ? data.features
            : [];
          setFeatures(feats);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // helper: extract timestamp
  const extractTimestamp = (props?: Record<string, any>): number | null => {
    if (!props) return null;
    const candidates = ["timestamp", "time", "ts", "date"];
    for (const k of candidates) {
      const v = props[k];
      if (v == null) continue;
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n;
      const parsed = Date.parse(String(v));
      if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
  };

  const orderedPoints = useMemo(() => {
    return features
      .map((f) => {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;
        const [lng, lat] = coords;
        const ts = extractTimestamp(f.properties);
        return { lat, lng, ts, props: f.properties ?? {} };
      })
      .filter((p): p is { lat: number; lng: number; ts: number | null; props: Record<string, any> } => !!p)
      .sort((a, b) => {
        if (a.ts === null && b.ts === null) return 0;
        if (a.ts === null) return 1;
        if (b.ts === null) return -1;
        return a.ts - b.ts;
      });
  }, [features]);

  const summaries = useMemo<CitySummary[]>(() => {
    const cityMap = new Map<string, CitySummary & { _sumLat?: number; _sumLng?: number; _count?: number }>();
    let lastCityKey: string | null = null;

    for (const p of orderedPoints) {
      const { lat, lng, ts } = p;
      if (ts === null) continue;

      const pt = turf.point([lng, lat]);

      // find which city polygon this point belongs to
      const containingCity = cityBoundaries.find((city) =>
        turf.booleanPointInPolygon(pt, city.polygon)
      );

      const key = containingCity ? containingCity.name : "UNKNOWN";
      let summary = cityMap.get(key);
      if (!summary) {
        // create summary with lat/lng null initially; accumulators for unlabeled averaging
        summary = {
          key,
          name: key,
          visits: 0,
          lastVisitedTs: null,
          visitTimestamps: [],
          lat: null,
          lng: null,
          _sumLat: 0,
          _sumLng: 0,
          _count: 0,
        };
        // if polygon exists, compute centroid immediately
        if (containingCity) {
          try {
            const cent = turf.centroid(containingCity.polygon);
            const centCoords = cent.geometry.coordinates; // [lng, lat]
            summary.lng = centCoords[0];
            summary.lat = centCoords[1];
          } catch {
            // ignore centroid errors; keep lat/lng null and rely on averaging later
          }
        }
        cityMap.set(key, summary);
      }

      // accumulate coords for averaging (also for polygon cities we still track points to allow better representative if desired)
      summary._sumLat = (summary._sumLat ?? 0) + lat;
      summary._sumLng = (summary._sumLng ?? 0) + lng;
      summary._count = (summary._count ?? 0) + 1;

      // if it's a new city compared to last, start a new visit
      if (key !== lastCityKey) {
        summary.visits += 1;
        summary.visitTimestamps.push(ts);
        lastCityKey = key;
      }

      // always update lastVisitedTs if newer
      if (!summary.lastVisitedTs || ts > summary.lastVisitedTs) {
        summary.lastVisitedTs = ts;
      }
    }

    // finalize representative coordinates: for entries without polygon centroid, use averaged coords
    for (const [, s] of cityMap) {
      if ((s.lat === null || s.lng === null) && (s._count ?? 0) > 0) {
        s.lat = (s._sumLat ?? 0) / (s._count ?? 1);
        s.lng = (s._sumLng ?? 0) / (s._count ?? 1);
      }
      // cleanup internal accumulators before returning (optional)
      delete (s as any)._sumLat;
      delete (s as any)._sumLng;
      delete (s as any)._count;
    }

    return Array.from(cityMap.values()).sort((a, b) => {
      return (b.lastVisitedTs ?? 0) - (a.lastVisitedTs ?? 0);
    });
  }, [orderedPoints, cityBoundaries]);

  return { summaries, loading, error };
}
