// Driver Dashboard — placeholder (full implementation in next phase)
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const STATUS_STYLE = {
  pending:     { bg: '#FFFBEB', color: '#CA8A04',  label: 'Pending'     },
  in_progress: { bg: '#EFF6FF', color: '#2563EB',  label: 'In Progress' },
  completed:   { bg: '#F0FDF4', color: '#16A34A',  label: 'Completed'   },
  cancelled:   { bg: '#F9FAFB', color: '#6B7280',  label: 'Cancelled'   },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function TripCard({ trip }) {
  const doneStops  = (trip.stops ?? []).filter((s) => s.status === 'done').length;
  const totalStops = (trip.stops ?? []).length;
  const spentPct   = trip.budget > 0 ? Math.min(100, Math.round((trip.budgetSpent ?? 0) / trip.budget * 100)) : 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: trip.status === 'in_progress' ? '2px solid #06B6D4' : '1px solid var(--border)',
        boxShadow: trip.status === 'in_progress' ? '0 0 0 4px rgba(6,182,212,0.1)' : 'var(--shadow)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base leading-tight" style={{ color: 'var(--text)' }}>
            {trip.title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
            {trip.type === 'procurement' ? '🛒 Procurement' : '🚚 Delivery'}
          </p>
        </div>
        <StatusPill status={trip.status} />
      </div>

      {/* Stops progress */}
      {totalStops > 0 && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-sub)' }}>
          📍 {doneStops}/{totalStops} stops done
        </p>
      )}

      {/* Budget bar */}
      {trip.budget > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-sub)' }}>
            <span>Budget</span>
            <span style={{ color: 'var(--text)' }}>₹{trip.budgetSpent ?? 0} / ₹{trip.budget}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${spentPct}%`, backgroundColor: spentPct > 90 ? '#EF4444' : '#06B6D4' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [trips,   setTrips]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'trips'),
      where('assignedDriver', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Show in-progress first, then pending, then completed
      list.sort((a, b) => {
        const order = { in_progress: 0, pending: 1, completed: 2, cancelled: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
      setTrips(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.uid]);

  const activeTrip = trips.find((t) => t.status === 'in_progress');

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* Header */}
      <div
        className="px-5 pt-10 pb-5"
        style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)' }}
      >
        <p className="text-sm text-white/80 mb-0.5">Driver Portal</p>
        <h1 className="text-2xl font-bold text-white">My Trips</h1>
        {activeTrip && (
          <div
            className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            🟢 Active: {activeTrip.title}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#06B6D4', borderTopColor: 'transparent' }}
            />
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              🚗
            </div>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>No trips assigned yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>Your manager will assign trips here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
