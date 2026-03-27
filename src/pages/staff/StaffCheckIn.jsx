// Staff Check-In page — shows today's scheduled check-in points and lets
// the staff member check in with a single tap.
//
// Data model assumed:
//   /checkInSchedules/{id}
//     locationName: string
//     scheduledTime: string  — "HH:MM" 24-h or Firestore Timestamp
//     appliesTo: string[]    — array of staffId values
//     branchId: string
//
//   /checkIns/{id}
//     staffId: string
//     branchId: string
//     scheduleId: string
//     timestamp: Timestamp
//     status: "checkedIn"
//     date: string  — "YYYY-MM-DD"
//
// Status logic (per schedule, per day):
//   Checked In   — a /checkIns doc exists for this scheduleId + staffId + today
//   Due Now      — no check-in AND current time is within ±15 min of scheduledTime
//   Upcoming     — no check-in AND more than 15 min before scheduled time
//   Missed       — no check-in AND more than 15 min after scheduled time
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const DUE_WINDOW_MINS = 15; // ±15 minutes around scheduled time = "Due Now"

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// Parse scheduledTime: accepts "HH:MM" string or Firestore Timestamp
function parseScheduledTime(scheduledTime) {
  if (!scheduledTime) return null;

  // Firestore Timestamp
  if (scheduledTime?.toDate) return scheduledTime.toDate();

  // "HH:MM" string — combine with today's date
  if (typeof scheduledTime === 'string' && scheduledTime.includes(':')) {
    const [h, m] = scheduledTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  return null;
}

function formatTime12(scheduledTime) {
  const d = parseScheduledTime(scheduledTime);
  if (!d) return '—';
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(lang) {
  try {
    return new Date().toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

// Derive status for a schedule, given the map of today's check-ins
function deriveStatus(schedule, checkInsMap) {
  const record = checkInsMap[schedule.id];
  if (record) return { kind: 'checkedIn', record };

  const scheduled = parseScheduledTime(schedule.scheduledTime);
  if (!scheduled) return { kind: 'upcoming' };

  const now = new Date();
  const diffMins = (now - scheduled) / 60_000; // positive = past, negative = future

  if (diffMins >= -DUE_WINDOW_MINS && diffMins <= DUE_WINDOW_MINS) {
    return { kind: 'dueNow' };
  }
  if (diffMins < -DUE_WINDOW_MINS) {
    return { kind: 'upcoming' };
  }
  return { kind: 'missed' };
}

// Sort: dueNow first, then upcoming (asc by time), then checkedIn, then missed
function sortSchedules(schedules, checkInsMap) {
  const order = { dueNow: 0, upcoming: 1, checkedIn: 2, missed: 3 };
  return [...schedules].sort((a, b) => {
    const sa = deriveStatus(a, checkInsMap).kind;
    const sb = deriveStatus(b, checkInsMap).kind;
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    // Within same group sort by scheduled time ascending
    const ta = parseScheduledTime(a.scheduledTime);
    const tb = parseScheduledTime(b.scheduledTime);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta - tb;
  });
}

// ── Badge component ───────────────────────────────────────────────────────────
function StatusBadge({ kind, th, t }) {
  switch (kind) {
    case 'checkedIn':
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
          ✅ {t('completed')}
        </span>
      );
    case 'dueNow':
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-600 text-white animate-pulse">
          {t('dueNow')}
        </span>
      );
    case 'missed':
      return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${th.badgeOverdue} flex items-center gap-1`}>
          ❌ {t('missed')}
        </span>
      );
    default:
      return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${th.badgeUpcoming}`}>
          {t('upcoming')}
        </span>
      );
  }
}

// ── Schedule Card ─────────────────────────────────────────────────────────────
function ScheduleCard({ schedule, status, th, t, onCheckIn, checkingInId }) {
  const isDueNow   = status.kind === 'dueNow';
  const isCheckedIn = status.kind === 'checkedIn';
  const isLoading   = checkingInId === schedule.id;

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden transition-all ${
        isDueNow
          ? 'border-green-400 shadow-lg shadow-green-100'
          : `${th.border}`
      } ${th.cardBg}`}
    >
      {/* Pulsing top accent for Due Now */}
      {isDueNow && (
        <div className="h-1.5 bg-green-400 animate-pulse" />
      )}

      <div className="p-5">
        {/* Location name */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">📍</span>
            <h3 className={`font-bold text-lg leading-tight truncate ${th.text}`}>
              {schedule.locationName ?? '—'}
            </h3>
          </div>
          <StatusBadge kind={status.kind} th={th} t={t} />
        </div>

        {/* Scheduled time */}
        <p className={`text-sm ${th.textSub} mb-1`}>
          {t('scheduledFor')}: <span className={`font-semibold ${th.text}`}>{formatTime12(schedule.scheduledTime)}</span>
        </p>

        {/* Checked-in timestamp */}
        {isCheckedIn && status.record?.timestamp && (
          <p className="text-sm text-green-600 font-medium">
            {t('checkedInAt')} {formatTimestamp(status.record.timestamp)}
          </p>
        )}

        {/* Check In Now button — only for Due Now */}
        {isDueNow && (
          <button
            onClick={() => onCheckIn(schedule)}
            disabled={isLoading}
            className="mt-4 w-full py-3.5 rounded-xl bg-green-600 text-white font-bold text-base active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>📍 {t('checkInNow')}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffCheckIn() {
  const { t, lang, th }  = useStaffCtx();
  const { userProfile }   = useAuth();

  const [schedules,    setSchedules]    = useState([]);
  const [checkInsMap,  setCheckInsMap]  = useState({}); // { scheduleId → checkIn doc }
  const [loading,      setLoading]      = useState(true);
  const [checkingInId, setCheckingInId] = useState(null); // scheduleId being processed

  // Refresh status badges every minute so Due Now / Missed updates live
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const staffId  = userProfile?.staffId;
  const branchId = userProfile?.branchId;

  // ── Firestore: today's schedules for this staff member ─────────────────────
  useEffect(() => {
    if (!staffId) return;

    const q = query(
      collection(db, 'checkInSchedules'),
      where('appliesTo', 'array-contains', staffId),
    );

    const unsub = onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [staffId]);

  // ── Firestore: today's check-in records for this staff member ──────────────
  useEffect(() => {
    if (!staffId) return;

    const q = query(
      collection(db, 'checkIns'),
      where('staffId',  '==', staffId),
      where('date',     '==', todayStr()),
    );

    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.scheduleId) map[data.scheduleId] = { id: d.id, ...data };
      });
      setCheckInsMap(map);
    });

    return unsub;
  }, [staffId]);

  // ── Check In handler ────────────────────────────────────────────────────────
  const handleCheckIn = useCallback(async (schedule) => {
    if (!staffId) return;
    setCheckingInId(schedule.id);
    try {
      await addDoc(collection(db, 'checkIns'), {
        staffId,
        branchId:   branchId ?? schedule.branchId ?? null,
        scheduleId: schedule.id,
        timestamp:  serverTimestamp(),
        status:     'checkedIn',
        date:       todayStr(),
      });
      toast.success(t('checkInSuccess'));
    } catch {
      toast.error('Check-in failed. Please try again.');
    } finally {
      setCheckingInId(null);
    }
  }, [staffId, branchId, t]);

  // Sort schedules (recalculate each tick so statuses refresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = sortSchedules(schedules, checkInsMap);

  return (
    <div className={`min-h-full ${th.pageBg}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`px-5 pt-10 pb-5 ${th.cardBg} border-b ${th.border}`}>
        <h1 className={`text-2xl font-bold ${th.text}`}>{t('checkIn')}</h1>
        <p className={`text-xs mt-1 ${th.textSub}`}>
          {t('today')}: {formatDate(lang)}
        </p>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : sorted.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-3xl">📋</span>
            </div>
            <p className={`font-semibold ${th.text}`}>{t('noCheckInsToday')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((schedule) => {
              const status = deriveStatus(schedule, checkInsMap);
              return (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  status={status}
                  th={th}
                  t={t}
                  onCheckIn={handleCheckIn}
                  checkingInId={checkingInId}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
