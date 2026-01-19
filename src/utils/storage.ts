export type LocationItem = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
  city?: string;
};

const LS_KEY = "terramark_locations";

/**
 * Load locations from localStorage
 */
export function getLocations(): LocationItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((loc: any) => ({
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      timestamp: Number(loc.timestamp),
      accuracy: loc.accuracy ? Number(loc.accuracy) : undefined,
      city: loc.city || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Save a location to localStorage
 */
export function saveLocation(loc: LocationItem): LocationItem[] {
  try {
    const locations = getLocations();
    locations.push({
      lat: loc.lat,
      lng: loc.lng,
      timestamp: loc.timestamp,
      accuracy: loc.accuracy ?? 50.0,
      city: loc.city ?? '',
    });
    localStorage.setItem(LS_KEY, JSON.stringify(locations));
    
    // Dispatch event for components that listen
    try {
      window.dispatchEvent(new CustomEvent("locations-updated"));
    } catch {}
    
    return locations;
  } catch (error) {
    console.error('Error saving location:', error);
    return getLocations();
  }
}

/**
 * Check if a location was saved on a specific day
 */
export function isSameDay(t1: number, t2: number): boolean {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Check if any location was saved today
 */
export function hasSavedToday(): boolean {
  const locations = getLocations();
  const now = Date.now();
  return locations.some((loc) => isSameDay(loc.timestamp, now));
}