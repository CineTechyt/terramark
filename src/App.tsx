import { useState, useEffect } from "react";
import "./App.css";
import WorldMap from "./components/WorldMap";
import MapPage from "./pages/MapPage";
import StatisticsPage from "./pages/StatisticsPage";
import { saveLocation, getLocations, hasSavedToday, type LocationItem } from "./utils/storage";
import { reverseGeocode } from "./utils/geocoding";

// add Material UI imports
import { Box, Button, Alert, Stack } from "@mui/material";
// use shared UI primitives
import { StyledContainer, HeaderTitle, MapRow, MapBox, ControlCard, BottomSpacer } from "./ui/Shared";

// add react-router imports
import AppRouter from "./AppRouter";

function App() {
  const [saved, setSaved] = useState<LocationItem[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<LocationItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load locations from localStorage on mount
    try {
      const locs = getLocations();
      setSaved(locs);
      
      // Request current position
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc: LocationItem = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: Date.now(),
            };
            setSelectedLocation(loc);
          },
          () => {
            // permission denied / unavailable: do nothing 
          },
          { enableHighAccuracy: true, maximumAge: 60_000 }
        );
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const getCurrentPositionAsync = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject)
    );

  const handleSaveLocation = async () => {
    // Check if already saved today
    if (hasSavedToday()) {
      setMsg("You already submitted a location today.");
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    setMsg("Requesting location…");
    try {
      const pos = await getCurrentPositionAsync();
      
      // Get city via reverse geocoding
      setMsg("Getting location details…");
      const { city } = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      
      const loc: LocationItem = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: Date.now(),
        city,
      };
      
      // Save to localStorage
      const updated = saveLocation(loc);
      setSaved(updated);
      setSelectedLocation(loc);
      setMsg(`Location saved${city ? ` in ${city}` : ''}.`);
    } catch (err: any) {
      setMsg("Failed to get location: " + (err?.message || err?.name || err));
    }
    setTimeout(() => setMsg(""), 2500);
  };

  if (loading) {
    return (
      <StyledContainer maxWidth="lg">
        <HeaderTitle variant="h1">Loading...</HeaderTitle>
      </StyledContainer>
    );
  }

  const markElement = (
    <StyledContainer maxWidth="lg">
      <HeaderTitle variant="h1">
        Drop a Pin
      </HeaderTitle>

      <MapRow>
        <MapBox>
          <WorldMap
            highlight={false}
            selectedLocation={selectedLocation ?? (saved.length ? saved[saved.length - 1] : null)}
          />
        </MapBox>
      </MapRow>

      <ControlCard>
        <Stack direction="column" spacing={2} alignItems="center">
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveLocation}
            disabled={hasSavedToday()}
          >
            Save current location
          </Button>

          <Box sx={{ width: "100%" }}>
            {msg && <Alert severity="info" sx={{ mb: 1 }}>{msg}</Alert>}
            {hasSavedToday() && (
              <Alert severity="success">
                Nice! You already saved a location today. Come back tomorrow to fill the map :)
              </Alert>
            )}
          </Box>
        </Stack>
      </ControlCard>

      <BottomSpacer aria-hidden="true" />
    </StyledContainer>
  );

  return (
    <AppRouter
      markElement={markElement}
      mapsElement={<MapPage/>}
      statisticsElement={<StatisticsPage/>}
    />
  );
}

export default App;