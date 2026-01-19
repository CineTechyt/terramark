export async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Terramark App'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }
    
    const data = await response.json();
    const address = data.address || {};
    
    // Extract city (try multiple fields in order of preference)
    const city = address.city || address.town || address.village || address.municipality || address.county || '';
    
    return { city };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return {};
  }
}
