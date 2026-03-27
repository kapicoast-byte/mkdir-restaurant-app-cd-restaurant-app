// Staff Shifts — shows this week's (Mon–Sun) shift schedule for the signed-in
// staff member.  Uses onSnapshot for real-time updates.
//
// Data model assumed:
//   /shifts/{id}
//     assignedStaff: string[]  — array of staffId values
//     date: string             — "YYYY-MM-DD"
//     startTime: string        — "HH:MM" (24-h) or readable string
//     endTime: string          — "HH:MM" (24-h) or readable string
//     locationName?: string    — optional area/location label
//     branchId?: string
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns Monday of the current week as a Date (week starts Mon)
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun…6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Build array of 7 Date objects: Mon → Sun
function getWeekDays() {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// YYYY-MM-DD string from a Date
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

// Localized day name ("Monday", "Tuesday", …)
function dayName(date, lang) {
  try {
    return date.toLocaleDateString(lang, { weekday: 'long' });
  } catch {
    return date.toLocaleDateString('en', { weekday: 'long' });
  }
}

// Localized short date ("Mar 27")
function shortDate(date, lang) {
  try {
    return date.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  } catch {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
}

// Is date in the past? (before today's midnight)
function isPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

// Is date today?
function isToday(date) {
  return toDateStr(date) === toDateStr(new Date());
}

// Format "HH:MM" or any time string for display
function formatTime(t) {
  if (!t) return '';
  // If already readable (e.g. "9:00 AM") return as-is
  if (t.includes('AM') || t.includes('PM') || t.includes('am') || t.includes('pm')) return t;
  // Parse 24-h "HH:MM"
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Shift Card ────────────────────────────────────────────────────────────────
function ShiftCard({ date, shift, lang, th, t }) {
  const today  = isToday(date);
  const past   = isPast(date);

  const cardBorder = today
    ? 'border-2 border-indigo-400'
    : `border ${th.border}`;

  const dayTextColor = past && !today ? th.textFaint : th.text;
  const timeTextColor = past && !today ? th.textSub : th.text;

  return (
    <div className={`rounded-2xl overflow-hidden ${th.cardBg} ${cardBorder} ${past && !today ? 'opacity-60' : ''}`}>
      {/* Colored top bar for today */}
      {today && <div className="h-1.5 bg-indigo-500" />}

      <div className="p-5">
        {/* Day name + date row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className={`font-bold text-lg leading-tight ${dayTextColor}`}>
              {dayName(date, lang)}
            </h3>
            <p className={`text-xs mt-0.5 ${th.textSub}`}>{shortDate(date, lang)}</p>
          </div>
          {today && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
              {t('today')}
            </span>
          )}
        </div>

        {shift ? (
          <>
            {/* Time block */}
            <div className="flex items-center gap-2">
              <span className={`text-base ${th.textSub}`}>🕐</span>
              <span className={`font-semibold text-base ${timeTextColor}`}>
                {formatTime(shift.startTime)} → {formatTime(shift.endTime)}
              </span>
            </div>
            {/* Location label if present */}
            {shift.locationName && (
              <p className={`text-xs mt-1.5 ${th.textSub}`}>📍 {shift.locationName}</p>
            )}
          </>
        ) : (
          // Day has no shift — show a dim dash
          <p className={`text-sm ${th.textFaint}`}>—</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffShifts() {
  const { t, lang, th } = useStaffCtx();
  const { userProfile }  = useAuth();

  const [shiftsMap, setShiftsMap] = useState({}); // { "YYYY-MM-DD" → shift doc }
  const [loading,   setLoading]   = useState(true);

  const staffId = userProfile?.staffId;
  const weekDays = getWeekDays(); // Mon→Sun of current week
  const weekStart = toDateStr(weekDays[0]);
  const weekEnd   = toDateStr(weekDays[6]);

  // ── Firestore: this week's shifts ────────────────────────────────────────
  useEffect(() => {
    if (!staffId) return;

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

  const hasAnyShift = weekDays.some((d) => shiftsMap[toDateStr(d)]);

  return (
    <div className={`min-h-full ${th.pageBg}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`px-5 pt-10 pb-5 ${th.cardBg} border-b ${th.border}`}>
        <h1 className={`text-2xl font-bold ${th.text}`}>{t('myShifts')}</h1>
        <p className={`text-xs mt-1 ${th.textSub}`}>{t('thisWeek')}</p>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : !hasAnyShift ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-3xl">📅</span>
            </div>
            <p className={`font-semibold ${th.text}`}>{t('noShiftsThisWeek')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weekDays.map((date) => (
              <ShiftCard
                key={toDateStr(date)}
                date={date}
                shift={shiftsMap[toDateStr(date)] ?? null}
                lang={lang}
                th={th}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
