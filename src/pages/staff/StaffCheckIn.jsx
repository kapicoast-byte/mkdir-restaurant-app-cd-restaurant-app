// Staff Check-In page — orange design system, mobile-first
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
const DUE_WINDOW_MINS = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function parseScheduledTime(scheduledTime) {
  if (!scheduledTime) return null;
  if (scheduledTime?.toDate) return scheduledTime.toDate();
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

function deriveStatus(schedule, checkInsMap) {
  const record = checkInsMap[schedule.id];
  if (record) return { kind: 'checkedIn', record };
  const scheduled = parseScheduledTime(schedule.scheduledTime);
  if (!scheduled) return { kind: 'upcoming' };
  const now = new Date();
  const diffMins = (now - scheduled) / 60_000;
  if (diffMins >= -DUE_WINDOW_MINS && diffMins <= DUE_WINDOW_MINS) return { kind: 'dueNow' };
  if (diffMins < -DUE_WINDOW_MINS) return { kind: 'upcoming' };
  return { kind: 'missed' };
}

function sortSchedules(schedules, checkInsMap) {
  const order = { dueNow: 0, upcoming: 1, checkedIn: 2, missed: 3 };
  return [...schedules].sort((a, b) => {
    const sa = deriveStatus(a, checkInsMap).kind;
    const sb = deriveStatus(b, checkInsMap).kind;
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    const ta = parseScheduledTime(a.scheduledTime);
    const tb = parseScheduledTime(b.scheduledTime);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta - tb;
  });
}

// ── Status indicator dot + label ──────────────────────────────────────────────
function StatusPill({ kind, t }) {
  const config = {
    checkedIn: { bg: '#F0FDF4', color: '#16A34A', label: '✓ ' + t('completed') },
    dueNow:    { bg: 'var(--color-primary)', color: '#fff', label: t('dueNow') },
    missed:    { bg: '#FEF2F2', color: '#DC2626', label: '✗ ' + t('missed') },
    upcoming:  { bg: 'var(--surface2)', color: 'var(--text-sub)', label: t('upcoming') },
  };
  const { bg, color, label } = config[kind] ?? config.upcoming;
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </span>
  );
}

// ── Schedule row card ─────────────────────────────────────────────────────────
function ScheduleCard({ schedule, status, t, onCheckIn, checkingInId }) {
  const isDueNow    = status.kind === 'dueNow';
  const isCheckedIn = status.kind === 'checkedIn';
  const isLoading   = checkingInId === schedule.id;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface)',
        border: isDueNow ? '2px solid var(--color-primary)' : '1px solid var(--border)',
        boxShadow: isDueNow ? '0 0 0 4px var(--color-primary-faint)' : 'var(--shadow)',
      }}
    >
      {/* Orange top bar for due-now */}
      {isDueNow && (
        <div
          className="h-1 animate-pulse"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      )}

      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Location icon circle */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{
                backgroundColor: isDueNow ? 'var(--color-primary-faint)' : 'var(--surface2)',
                color: isDueNow ? 'var(--color-primary)' : 'var(--text-sub)',
              }}
            >
              📍
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight truncate" style={{ color: 'var(--text)' }}>
                {schedule.locationName ?? '—'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                {t('scheduledFor')}: <span className="font-semibold" style={{ color: 'var(--text)' }}>{formatTime12(schedule.scheduledTime)}</span>
              </p>
              {isCheckedIn && status.record?.timestamp && (
                <p className="text-xs mt-0.5 font-medium" style={{ color: '#16A34A' }}>
                  {t('checkedInAt')} {formatTimestamp(status.record.timestamp)}
                </p>
              )}
            </div>
          </div>
          <StatusPill kind={status.kind} t={t} />
        </div>

        {isDueNow && (
          <button
            onClick={() => onCheckIn(schedule)}
            disabled={isLoading}
            className="mt-4 w-full py-3.5 rounded-xl text-white font-bold text-base disabled:opacity-60 transition-opacity active:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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
  const { t, lang }   = useStaffCtx();
  const { userProfile } = useAuth();

  const [schedules,    setSchedules]    = useState([]);
  const [checkInsMap,  setCheckInsMap]  = useState({});
  const [loading,      setLoading]      = useState(true);
  const [checkingInId, setCheckingInId] = useState(null);
  const [tick,         setTick]         = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const staffId  = userProfile?.staffId;
  const branchId = userProfile?.branchId;

  // ── Firestore: today's schedules ──────────────────────────────────────────
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

  // ── Firestore: today's check-in records ───────────────────────────────────
  useEffect(() => {
    if (!staffId) return;
    const q = query(
      collection(db, 'checkIns'),
      where('staffId', '==', staffId),
      where('date',    '==', todayStr()),
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

  const handleCheckIn = useCallback(async (schedule) => {
    if (!staffId) return;
    if (navigator.vibrate) navigator.vibrate(10);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = sortSchedules(schedules, checkInsMap);
  const hasDueNow = sorted.some((s) => deriveStatus(s, checkInsMap).kind === 'dueNow');

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-12 pb-5" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{t('checkIn')}</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
          {t('today')}: {formatDate(lang)}
        </p>
      </div>

      {/* ── Pulsing orange due-now banner ────────────────────────────────── */}
      {hasDueNow && (
        <div
          className="mx-4 mt-4 px-4 py-3 rounded-xl flex items-center gap-3 animate-pulse"
          style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)', color: '#fff' }}
        >
          <span className="text-lg flex-shrink-0">🔔</span>
          <p className="text-sm font-semibold">Check-in is due now! Tap below to check in.</p>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              📋
            </div>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{t('noCheckInsToday')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((schedule) => {
              const status = deriveStatus(schedule, checkInsMap);
              return (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  status={status}
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
