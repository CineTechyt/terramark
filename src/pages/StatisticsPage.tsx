import { Container, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { HeaderTitle } from "../ui/Shared";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  TableSortLabel,
  CircularProgress,
  Card,
  CardContent,
} from "@mui/material";
import { getLocations, type LocationItem } from "../utils/storage";

const StyledContainer = styled(Container)(({ theme }) => ({
  marginTop: theme.spacing(3),
}));

// point-in-polygon helper (minimal; copied/adapted from WorldMap)
function booleanPointInPolygon(featureOrPoint: any, polyFeatureOrGeom: any): boolean {
  if (!featureOrPoint || !polyFeatureOrGeom) return false;
  const getPoint = (p: any) => {
    if (p.type === "Feature") return p.geometry?.coordinates;
    if (Array.isArray(p) && p.length >= 2) return p;
    if (p.coordinates) return p.coordinates;
    return null;
  };
  const pt = getPoint(featureOrPoint);
  if (!pt) return false;
  const lng = pt[0], lat = pt[1];
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
    if (!pointInRing(lng, lat, polygonCoords[0])) return false;
    for (let i = 1; i < polygonCoords.length; i++) {
      if (pointInRing(lng, lat, polygonCoords[i])) return false;
    }
    return true;
  };

  if (geom.type === "Polygon") return polygonContains(lng, lat, geom.coordinates);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (polygonContains(lng, lat, poly)) return true;
    }
  }
  return false;
}

export default function StatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [countriesGeojson, setCountriesGeojson] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // sorting state for tables
  const [citySortKey, setCitySortKey] = useState<string>("visits");
  const [citySortDir, setCitySortDir] = useState<"asc" | "desc">("desc");
  const [countrySortKey, setCountrySortKey] = useState<string>("days");
  const [countrySortDir, setCountrySortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        
        // Load locations from localStorage
        const locs = getLocations();
        
        if (cancelled) return;

        // attempt to fetch countries geojson for country resolution
        try {
          const cr = await fetch("/countries.geojson");
          if (cr.ok) {
            const cg = await cr.json();
            if (!cancelled) setCountriesGeojson(cg);
          }
        } catch {
          // ignore
        }

        if (!cancelled) {
          setLocations(locs);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    
    return () => { 
      cancelled = true;
    };
  }, []);

  // Process stats
  const {
    totalPins,
    distinctCitiesCount,
    distinctCountriesCount,
    cityRows,
    countryRows,
  } = useMemo(() => {
    const totalPins = locations.length;

    // Build normalized point list.
    // - Use null for missing timestamps (do not default to 0).
    // - Keep original index to stable-sort entries without timestamps after timestamped ones.
    const pts = locations
      .map((e, idx) => ({
        lat: Number(e.lat),
        lng: Number(e.lng),
        ts: e.timestamp != null ? Number(e.timestamp) : null,
        idx,
        city: (e.city ?? (e as any).City ?? (e as any).properties?.city ?? "").toString().trim(),
        country: ((e as any).country ?? (e as any).properties?.country ?? "").toString().trim(),
      }))
      .sort((a, b) => {
        if (a.ts != null && b.ts != null) return a.ts - b.ts;
        if (a.ts != null && b.ts == null) return -1;
        if (a.ts == null && b.ts != null) return 1;
        return a.idx - b.idx;
      });

    // Resolve country for entries lacking country using countriesGeojson if available
    if (countriesGeojson) {
      for (const p of pts) {
        if (!p.country) {
          for (const c of countriesGeojson.features || []) {
            try {
              if (booleanPointInPolygon([p.lng, p.lat], c)) {
                const name = c.properties?.NAME || c.properties?.name || c.properties?.ADMIN || "";
                p.country = name;
                break;
              }
            } catch {}
          }
        }
      }
    }

    // Log entries that still have unknown country
    const unknownEntries = pts.filter((p) => !p.country || p.country === "" || p.country === "Unknown");
    if (unknownEntries.length) {
      // concise log for debugging
      console.warn("StatisticsPage: entries with unknown country:", JSON.stringify(unknownEntries.slice(0, 200), null, 2));
    }

    // Distinct cities
    const citySet = new Set<string>();
    for (const p of pts) if (p.city) citySet.add(p.city);
    const distinctCitiesCount = citySet.size;

    // Distinct countries
    const countrySet = new Set<string>();
    for (const p of pts) if (p.country) countrySet.add(p.country);
    const distinctCountriesCount = countrySet.size;

    // City aggregation: compute visits (count when city changes in chronological order),
    // days spent (unique date) only from entries with timestamps, lastVisited (max ts)
    const cityMap = new Map<string, {
      lastTs: number;
      visits: number;
      daySet: Set<string>;
      sumLat: number;
      sumLng: number;
      count: number;
    }>();

    let lastCity: string | null = null;
    for (const p of pts) {
      const city = p.city || "";
      if (!city) { lastCity = null; continue; }

      // derive day only when timestamp present
      const hasTs = p.ts != null;
      const d = hasTs ? new Date(p.ts as number) : null;
      const dayKey = hasTs && d ? d.toISOString().slice(0,10) : null;

      let rec = cityMap.get(city);
      if (!rec) rec = { lastTs: 0, visits: 0, daySet: new Set(), sumLat: 0, sumLng: 0, count: 0 };
      // visits: if city != lastCity (change in chronology)
      if (city !== lastCity) {
        rec.visits += 1;
        lastCity = city;
      }
      if (dayKey) rec.daySet.add(dayKey);
      if (hasTs && (!rec.lastTs || (p.ts as number) > rec.lastTs)) rec.lastTs = p.ts as number;
      if (!Number.isNaN(p.lat)) { rec.sumLat += p.lat; rec.sumLng += p.lng; rec.count += 1; }
      cityMap.set(city, rec);
    }

    // Build city rows
    const cityRows: Array<any> = [];
    for (const [name, v] of cityMap) {
      const avgLat = v.count ? v.sumLat / v.count : undefined;
      const avgLng = v.count ? v.sumLng / v.count : undefined;
      cityRows.push({
        city: name,
        lastVisitedTs: v.lastTs || 0,
        visits: v.visits,
        days: v.daySet.size,
        avgLat,
        avgLng,
      });
    }

    // Country aggregation: group points to countries (use p.country)
    const countryMap = new Map<string, {
      daySet: Set<string>;
      lastTs: number;
      visits: number; // visits counted by country-change events
      citySet: Set<string>;
    }>();

    // Compute country stats based on chronological country-change visits.
    let lastCountry: string | null = null;
    for (const p of pts) {
      const country = p.country || "Unknown";
      const hasTs = p.ts != null;
      const dayKey = hasTs ? new Date(p.ts as number).toISOString().slice(0,10) : null;
      let rec = countryMap.get(country);
      if (!rec) rec = { daySet: new Set(), lastTs: 0, visits: 0, citySet: new Set() };

      // visits: increment when country changes from lastCountry
      if (country !== lastCountry) {
        rec.visits += 1;
        lastCountry = country;
      }
      if (dayKey) rec.daySet.add(dayKey);
      if (hasTs && (!rec.lastTs || (p.ts as number) > rec.lastTs)) rec.lastTs = p.ts as number;
      if (p.city) rec.citySet.add(p.city);
      countryMap.set(country, rec);
    }

    // Build country rows
    const countryRows: Array<any> = [];
    for (const [country, v] of countryMap) {
      // Skip unknown or empty countries
      if (!country || country === "" || country === "Unknown") continue;
      
      countryRows.push({
        country,
        lastVisitedTs: v.lastTs || 0,
        visits: v.visits,
        days: v.daySet.size,
        cityCount: v.citySet.size,
      });
    }

    return { totalPins, distinctCitiesCount, distinctCountriesCount, cityRows, countryRows };
  }, [locations, countriesGeojson]);

  // Sorting helpers
  const stableSort = (arr: any[], key: string, dir: "asc"|"desc") => {
    return [...arr].sort((a,b) => {
      const va = a[key] ?? 0;
      const vb = b[key] ?? 0;
      if (typeof va === "string" && typeof vb === "string") {
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return dir === "asc" ? (va - vb) : (vb - va);
    });
  };

  if (loading) {
    return (
      <StyledContainer maxWidth="lg">
        <HeaderTitle variant="h1">Statistics</HeaderTitle>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer maxWidth="lg">
      <HeaderTitle variant="h1">Statistics</HeaderTitle>
      {error && <Typography color="error">Error: {error}</Typography>}

      <Box sx={{ my: 2 }}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 220px", minWidth: 220 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2">Total pins</Typography>
                <Typography variant="h5">{totalPins}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: "1 1 220px", minWidth: 220 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2">Distinct cities</Typography>
                <Typography variant="h5">{distinctCitiesCount}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: "1 1 220px", minWidth: 220 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2">Distinct countries</Typography>
                <Typography variant="h5">{distinctCountriesCount}</Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6">Countries</Typography>
        <Paper sx={{ width: "100%", overflowX: "auto", mt: 1 }}>
          <Table size="small" aria-label="countries table">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={countrySortKey==="country"}
                    direction={countrySortDir}
                    onClick={() => {
                      setCountrySortKey("country");
                      setCountrySortDir(countrySortKey==="country" && countrySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Country
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={countrySortKey==="lastVisitedTs"}
                    direction={countrySortDir}
                    onClick={() => {
                      setCountrySortKey("lastVisitedTs");
                      setCountrySortDir(countrySortKey==="lastVisitedTs" && countrySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Last visited
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={countrySortKey==="visits"}
                    direction={countrySortDir}
                    onClick={() => {
                      setCountrySortKey("visits");
                      setCountrySortDir(countrySortKey==="visits" && countrySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Visits
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={countrySortKey==="days"}
                    direction={countrySortDir}
                    onClick={() => {
                      setCountrySortKey("days");
                      setCountrySortDir(countrySortKey==="days" && countrySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Days
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={countrySortKey==="cityCount"}
                    direction={countrySortDir}
                    onClick={() => {
                      setCountrySortKey("cityCount");
                      setCountrySortDir(countrySortKey==="cityCount" && countrySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Cities visited
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stableSort(countryRows, countrySortKey, countrySortDir).map((row: any) => (
                <TableRow key={row.country}>
                  <TableCell component="th" scope="row">{row.country}</TableCell>
                  <TableCell align="right">{row.lastVisitedTs ? new Date(row.lastVisitedTs).toLocaleString() : "—"}</TableCell>
                  <TableCell align="right">{row.visits}</TableCell>
                  <TableCell align="right">{row.days}</TableCell>
                  <TableCell align="right">{row.cityCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6">Cities</Typography>
        <Paper sx={{ width: "100%", overflowX: "auto", mt: 1 }}>
          <Table size="small" aria-label="cities table">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={citySortKey==="city"}
                    direction={citySortDir}
                    onClick={() => {
                      setCitySortKey("city");
                      setCitySortDir(citySortKey==="city" && citySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    City
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={citySortKey==="lastVisitedTs"}
                    direction={citySortDir}
                    onClick={() => {
                      setCitySortKey("lastVisitedTs");
                      setCitySortDir(citySortKey==="lastVisitedTs" && citySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Last visited
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={citySortKey==="visits"}
                    direction={citySortDir}
                    onClick={() => {
                      setCitySortKey("visits");
                      setCitySortDir(citySortKey==="visits" && citySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Visits
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={citySortKey==="days"}
                    direction={citySortDir}
                    onClick={() => {
                      setCitySortKey("days");
                      setCitySortDir(citySortKey==="days" && citySortDir==="asc" ? "desc" : "asc");
                    }}
                  >
                    Days
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stableSort(cityRows, citySortKey, citySortDir).map((row: any) => (
                <TableRow key={row.city}>
                  <TableCell component="th" scope="row">{row.city}</TableCell>
                  <TableCell align="right">{row.lastVisitedTs ? new Date(row.lastVisitedTs).toLocaleString() : "—"}</TableCell>
                  <TableCell align="right">{row.visits}</TableCell>
                  <TableCell align="right">{row.days}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

    </StyledContainer>
  );
}