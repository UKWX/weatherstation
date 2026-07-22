/**
 * Location Resolver
 * Converts place names, postcodes, and coordinates to WGS-84 lat/lon
 * using the Nominatim OpenStreetMap geocoding API.
 */

export type ResolvedLocation = {
  query: string;
  name: string;
  lat: number;
  lon: number;
  country: string;
  region?: string;
};

const geocodeCache = new Map<string, ResolvedLocation | null>();

/**
 * Attempt to parse a raw "lat,lon" coordinate string.
 * Accepts formats like "53.76,-1.50" or "53.76 -1.50".
 */
function tryParseCoords(query: string): { lat: number; lon: number } | null {
  const clean = query.trim().replace(/\s+/, ',');
  const match = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/.exec(clean);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  return null;
}

export async function resolveLocation(query: string): Promise<ResolvedLocation | null> {
  const key = query.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  // Coordinate shortcut
  const coords = tryParseCoords(query);
  if (coords) {
    const loc: ResolvedLocation = {
      query,
      name: `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`,
      lat: coords.lat,
      lon: coords.lon,
      country: 'Unknown',
    };
    geocodeCache.set(key, loc);
    return loc;
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { 'Accept-Language': 'en-GB', 'User-Agent': 'UKWX-Isobront/1.0' } }
    );
    if (!res.ok) { geocodeCache.set(key, null); return null; }

    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: {
        country?: string;
        state?: string;
        county?: string;
        city?: string;
        town?: string;
        village?: string;
      };
    }>;

    if (!data.length) { geocodeCache.set(key, null); return null; }

    const first = data[0];
    const addr = first.address ?? {};
    const locality = addr.city ?? addr.town ?? addr.village ?? query;
    const region = addr.county ?? addr.state;

    const loc: ResolvedLocation = {
      query,
      name: locality,
      lat: parseFloat(first.lat),
      lon: parseFloat(first.lon),
      country: addr.country ?? 'Unknown',
      region,
    };
    geocodeCache.set(key, loc);
    return loc;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

/**
 * Resolve the user's current position using the browser Geolocation API.
 * Returns null if permission is denied or unavailable.
 */
export function resolveCurrentPosition(): Promise<ResolvedLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          query: 'my location',
          name: 'Your location',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          country: 'Unknown',
        });
      },
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}
