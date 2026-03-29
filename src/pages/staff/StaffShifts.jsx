// Staff Shifts — 7-day compact row list, orange today highlight, week navigator
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDays(offsetWeeks = 0) {
  const start = getWeekStart(offsetWeeks);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function dayAbbr(date, lang) {
  try {
    return date.toLocaleDateString(lang, { weekday: 'short' });
  } catch {
    return date.toLocaleDateString('en', { weekday: 'short' });
  }
}

function shortDate(date, lang) {
  try {
    return date.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  } catch {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
}

function isToday(date) {
  return toDateStr(date) === toDateStr(new Date());
}

function isPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function formatTime(t) {
  if (!t) return '';
  if (t.includes('AM') || t.includes('PM') || t.includes('am') || t.includes('pm')) return t;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Shift Row ─────────────────────────────────────────────────────────────────
function ShiftRow({ date, shift, lang, t }) {
  const today = isToday(date);
  const past  = isPast(date) && !today;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        backgroundColor: today ? 'var(--color-primary)' : 'var(--surface)',
        border: today ? 'none' : '1px solid var(--border)',
        opacity: past ? 0.55 : 1,
        boxShadow: today ? '0 4px 16px rgba(249,115,22,0.25)' : 'var(--shadow)',
      }}
    >
      {/* Day column */}
      <div className="w-14 flex-shrink-0 text-center">
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: today ? 'rgba(255,255,255,0.8)' : 'var(--text-sub)' }}
        >
          {dayAbbr(date, lang)}
        </p>
        <p
          className="text-lg font-bold leading-none mt-0.5"
          style={{ color: today ? '#fff' : 'var(--text)' }}
        >
          {date.getDate()}
        </p>
      </div>

      {/* Divider */}
      <div
        className="w-px self-stretch flex-shrink-0"
        style={{ backgroundColor: today ? 'rgba(255,255,255,0.3)' : 'var(--border)' }}
      />

      {/* Shift info */}
      <div className="flex-1 min-w-0">
        {shift ? (
          <>
            <p
              className="text-sm font-semibold"
              style={{ color: today ? '#fff' : 'var(--text)' }}
            >
              {formatTime(shift.startTime)} → {formatTime(shift.endTime)}
            </p>
            {shift.locationName && (
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: today ? 'rgba(255,255,255,0.75)' : 'var(--text-sub)' }}
              >
                📍 {shift.locationName}
              </p>
            )}
          </>
        ) : (
          <p
            className="text-sm"
            style={{ color: today ? 'rgba(255,255,255,0.6)' : 'var(--text-faint)' }}
          >
            {t('dayOff') ?? 'Day off'}
          </p>
        )}
      </div>

      {/* Today pill */}
      {today && (
        <span
          className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
        >
          {t('today')}
        </span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffShifts() {
  const { t, lang }  = useStaffCtx();
  const { userProfile } = useAuth();

  const [shiftsMap,   setShiftsMap]   = useState({});
  const [loading,     setLoading]     = useState(true);
  const [weekOffset,  setWeekOffset]  = useState(0);

  const staffId = userProfile?.staffId;
  const weekDays  = getWeekDays(weekOffset);
  const weekStart = toDateStr(weekDays[0]);
  const weekEnd   = toDateStr(weekDays[6]);

  // ── Firestore: this week's shifts ────────────────────────────────────────
  useEffect(() => {
    if (!staffId) return;
    setLoading(true);
    const q = query(
      collection(db, 'shifts'),
      where('assignedStaff', 'array-contains', staffId),
      where('date', '>=', weekStart),
      where('date', '<=', weekEnd),
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.date) map[data.date] = { id: d.id, ...data };
      });
      setShiftsMap(map);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, weekStart, weekEnd]);

  // Week label
  const weekLabel = (() => {
    if (weekOffset === 0) return t('thisWeek') ?? 'This Week';
    if (weekOffset === -1) return t('lastWeek') ?? 'Last Week';
    if (weekOffset === 1) return t('nextWeek') ?? 'Next Week';
    const s = weekDays[0];
    const e = weekDays[6];
    try {
      return `${s.toLocaleDateString(lang, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(lang, { month: 'short', day: 'numeric' })}`;
    } catch {
      return `${s.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
    }
  })();

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Header with week navigator ───────────────────────────────── */}
      <div className="px-5 pt-12 pb-4" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{t('myShifts')}</h1>

        {/* Week navigator */}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:opacity-70 transition-opacity"
            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)' }}
          >
            ‹
          </button>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {weekLabel}
          </p>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:opacity-70 transition-opacity"
            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)' }}
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Shift rows ───────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {weekDays.map((date) => (
              <ShiftRow
                key={toDateStr(date)}
                date={date}
                shift={shiftsMap[toDateStr(date)] ?? null}
                lang={lang}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
