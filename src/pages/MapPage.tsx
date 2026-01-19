import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Typography,
} from "@mui/material";
// reuse shared UI primitives
import WorldMap from "../components/WorldMap";
import WorldHeatMap from "../components/WorldHeatMap";
import { HeaderTitle, StyledContainer } from "../ui/Shared";
import { getLocations, type LocationItem } from "../utils/storage";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

// Point-in-polygon helper (same as in StatisticsPage)
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

export default function MapPage() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const isSm = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [countriesGeojson, setCountriesGeojson] = useState<any | null>(null);
  
  useEffect(() => {
    // Load from localStorage
    const loadLocations = () => {
      try {
        const locs = getLocations();
        setLocations(locs);
      } catch (err) {
        console.error("Error loading locations:", err);
        setLocations([]);
      }
    };

    loadLocations();

    // Listen for updates
    const handleUpdate = () => loadLocations();
    window.addEventListener("locations-updated", handleUpdate);
    
    return () => {
      window.removeEventListener("locations-updated", handleUpdate);
    };
  }, []);
 
  useEffect(() => {
    // Load countries geojson for country detection
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const url = `${baseUrl}countries.geojson`.replace(/\/+/g, '/');
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setCountriesGeojson(data);
        }
      } catch (err) {
        console.error("Error loading countries:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);
 
   // compute number of distinct cities (use properties.city or fallback)
   const numberOfCities = useMemo(() => {
     const s = new Set<string>();
    for (const f of locations) {
      // handle both shapes: plain object { city: "Name" } or GeoJSON Feature { properties: { city: "Name" } }
      let city = "";
      if (f && typeof f === "object") {
        // prefer direct city field if present
        if ("city" in f && (f as any).city != null) {
          city = String((f as any).city).trim();
        } else if ("properties" in f && (f as any).properties != null) {
          // only access .properties after checking it exists on the object
          city = String((f as any).properties?.city ?? (f as any).properties?.name ?? "").trim();
        } else if ("name" in f && (f as any).name != null) {
          city = String((f as any).name).trim();
        }
      }
       if (city) s.add(city);
     }
     return s.size;
   }, [locations]);

  // Compute number of distinct countries
  const numberOfCountries = useMemo(() => {
    if (!countriesGeojson || !locations.length) return 0;

    const countrySet = new Set<string>();

    for (const loc of locations) {
      const point = [loc.lng, loc.lat];
      
      // Check which country this point is in
      for (const country of countriesGeojson.features || []) {
        try {
          if (booleanPointInPolygon(point, country)) {
            const name = country.properties?.NAME || country.properties?.name || country.properties?.ADMIN || "";
            if (name) {
              countrySet.add(name);
              break; // Found the country, move to next location
            }
          }
        } catch {}
      }
    }

    return countrySet.size;
  }, [locations, countriesGeojson]);
 
  // Calculate responsive height
  const mapHeight = isXs ? '60vh' : isSm ? '70vh' : '100vh';
 
   return (
     <>
       <StyledContainer maxWidth="lg">
         <HeaderTitle variant="h1">Heatmap</HeaderTitle>
         <Typography variant="body1">
             This heatmap shows the density of your saved locations around the world.
         </Typography>
         <Box my={2}>
             <WorldHeatMap height={mapHeight} />
         </Box>
         <Box sx={{ height: 64 }} />
       </StyledContainer>
       
       
       <StyledContainer maxWidth="lg">
           <HeaderTitle variant="h1">Map of Visited Countries</HeaderTitle>
           <Typography variant="body1">
               This map shows the countries you have visited based on your saved locations.
               In total, you have visited {numberOfCountries} {numberOfCountries === 1 ? 'country' : 'countries'}.
           </Typography>
           <Box my={2}>
               <WorldMap highlight={true} height={mapHeight} />
           </Box>
           <Box sx={{ height: 64 }} />
       </StyledContainer>



       <StyledContainer maxWidth="lg">
             <HeaderTitle variant="h1">Map of Visited Cities</HeaderTitle>
             <Typography variant="body1">
                 This map shows the cities you have visited based on your saved locations.
                 In total, you have visited {numberOfCities} cities.
             </Typography>
             <Box my={2}>
               <WorldMap city={true} height={mapHeight} />
             </Box>
             <Box sx={{ height: 64 }} />
       </StyledContainer>
     </>
   );
}