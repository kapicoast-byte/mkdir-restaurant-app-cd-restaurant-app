// Dynamically loads the Google Maps JavaScript API (once per page) and
// returns a boolean `loaded` flag.
//
// Usage:
//   const mapsLoaded = useGoogleMaps(['places']);
//
// - Reads the API key from VITE_GOOGLE_MAPS_API_KEY.
// - Safe to call from multiple components simultaneously — the script tag
//   is only injected once; subsequent callers poll until window.google.maps
//   is available.
// - Returns `false` immediately (and never resolves) if the env var is unset,
//   so callers can degrade gracefully without the key.
import { useState, useEffect } from 'react';

const SCRIPT_ID = 'gmap-js-api';

export function useGoogleMaps(libraries = []) {
  const [loaded, setLoaded] = useState(() => !!window.google?.maps);

  useEffect(() => {
    if (window.google?.maps) { setLoaded(true); return; }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return; // no key — caller should show fallback UI

    // Script already injected (maybe by another component instance); poll
    if (document.getElementById(SCRIPT_ID)) {
      const id = setInterval(() => {
        if (window.google?.maps) { setLoaded(true); clearInterval(id); }
      }, 100);
      return () => clearInterval(id);
    }

    // First caller — inject the script
    const script = document.createElement('script');
    script.id    = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src   = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}&loading=async`;
    script.onload = () => setLoaded(true);
    script.onerror = () => console.error('[useGoogleMaps] Failed to load Maps JS API');
    document.head.appendChild(script);

    // No cleanup — the script stays loaded for the lifetime of the page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return loaded;
}
