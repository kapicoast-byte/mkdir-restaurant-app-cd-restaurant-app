// Driver Navigate — live map of active in-progress trip with stop markers
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

// ── MapBoundsFitter ────────────────────────────────────────────────────────────
function MapBoundsFitter({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!map || positions.length === 0) return;
    if (typeof window.google === 'undefined') return;
    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach(({ lat, lng }) => bounds.extend({ lat, lng }));
    map.fitBounds(bounds, { top: 60, right: 20, bottom: 20, left: 20 });
  }, [map, positions]);
  return null;
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    done:    { bg: '#DCFCE7', color: '#16A34A', label: 'Done' },
    pending: { bg: '#FFF7ED', color: '#F97316', label: 'Pending' },
    issue:   { bg: '#FEF2F2', color: '#DC2626', label: 'Issue' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 999,
        backgroundColor: s.bg,
        color: s.color,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DriverNavigate() {
  const { user } = useAuth();
  const [trip,    setTrip]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to in_progress trip for this driver
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'trips'),
      where('assignedDriver', '==', user.uid),
      where('status', '==', 'in_progress'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setTrip({ id: d.id, ...d.data() });
        } else {
          setTrip(null);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  const stops     = trip?.stops ?? [];
  const doneCount = stops.filter((s) => s.status === 'done').length;

  // Positions for MapBoundsFitter
  const validPositions = stops
    .filter((s) => s.coordinates?.lat != null && s.coordinates?.lng != null)
    .map((s) => ({ lat: s.coordinates.lat, lng: s.coordinates.lng }));

  if (trip?.driverLocation?.lat != null) {
    validPositions.push({ lat: trip.driverLocation.lat, lng: trip.driverLocation.lng });
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          backgroundColor: 'var(--bg)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '3px solid #F97316',
            borderTopColor: 'transparent',
            animation: 'dn-spin 700ms linear infinite',
          }}
        />
        <style>{`@keyframes dn-spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 14, color: 'var(--text-sub)' }}>Loading trip…</p>
      </div>
    );
  }

  // ── No active trip ─────────────────────────────────────────────────────────
  if (!trip) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 32,
          textAlign: 'center',
          backgroundColor: 'var(--bg)',
        }}
      >
        <div style={{ fontSize: 64 }}>🗺️</div>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          No Active Trip
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-sub)', maxWidth: 280, margin: 0 }}>
          Start a trip from My Trips to see navigation here
        </p>
      </div>
    );
  }

  // ── No Maps key ───────────────────────────────────────────────────────────
  const mapSection = MAPS_KEY ? (
    <div
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        height: 300,
        flexShrink: 0,
      }}
    >
      <APIProvider apiKey={MAPS_KEY} libraries={['places']}>
        <Map
          defaultCenter={{ lat: 20.5937, lng: 78.9629 }}
          defaultZoom={11}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          <MapBoundsFitter positions={validPositions} />

          {stops.map((stop, idx) =>
            stop.coordinates?.lat != null && stop.coordinates?.lng != null ? (
              <AdvancedMarker
                key={stop.id ?? idx}
                position={{ lat: stop.coordinates.lat, lng: stop.coordinates.lng }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor:
                      stop.status === 'done' ? '#16A34A' : '#F97316',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: 14,
                    border: '2px solid #fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  {idx + 1}
                </div>
              </AdvancedMarker>
            ) : null,
          )}

          {trip.driverLocation?.lat != null && (
            <AdvancedMarker
              position={{
                lat: trip.driverLocation.lat,
                lng: trip.driverLocation.lng,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: '#F97316',
                  border: '3px solid #fff',
                  boxShadow: '0 0 0 4px rgba(249,115,22,0.3)',
                }}
              />
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>
    </div>
  ) : (
    <div
      style={{
        height: 300,
        borderRadius: 16,
        backgroundColor: 'var(--surface2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>
        Google Maps not configured
      </p>
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
        paddingBottom: 32,
      }}
    >
      {/* Trip title card */}
      <div
        style={{
          margin: '16px 16px 12px',
          padding: '14px 16px',
          borderRadius: 16,
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
        }}
      >
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {trip.title} &mdash; {doneCount}/{stops.length} stops
        </p>
      </div>

      {/* Map */}
      <div style={{ padding: '0 16px 16px' }}>{mapSection}</div>

      {/* Stop list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stops.map((stop, idx) => {
          const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address ?? stop.placeName ?? '')}`;
          return (
            <div
              key={stop.id ?? idx}
              style={{
                backgroundColor: 'var(--surface)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: 'var(--shadow)',
              }}
            >
              {/* Number badge */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor:
                    stop.status === 'done' ? '#16A34A' : '#F97316',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    margin: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {stop.placeName ?? stop.name ?? '—'}
                </p>
                {stop.address && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-sub)',
                      margin: '2px 0 0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {stop.address}
                  </p>
                )}
              </div>

              {/* Status + navigate */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <StatusPill status={stop.status ?? 'pending'} />
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#F97316',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Navigate →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
