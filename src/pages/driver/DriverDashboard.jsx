// Driver Dashboard — My Trips tab
// Full mobile-first implementation: trip list, active trip view, GPS tracking,
// mark done flow (camera + receipt upload), report issue flow, complete trip.
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp, arrayRemove,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDuration(startTs, endTs) {
  if (!startTs || !endTs) return null;
  const start = startTs?.toDate ? startTs.toDate() : new Date(startTs);
  const end   = endTs?.toDate   ? endTs.toDate()   : new Date(endTs);
  const mins  = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}m`;
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'D';
}

// ── Styles ────────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  pending:     { bg: '#FFFBEB', color: '#CA8A04', label: 'Pending'     },
  in_progress: { bg: '#FFF7ED', color: '#EA580C', label: 'In Progress' },
  completed:   { bg: '#F0FDF4', color: '#16A34A', label: 'Completed'   },
  cancelled:   { bg: '#F9FAFB', color: '#6B7280', label: 'Cancelled'   },
};

const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: '12px',
  border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
  color: 'var(--text)', fontSize: '16px', outline: 'none',
};

const sheetStyle = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  borderRadius: '24px 24px 0 0', backgroundColor: 'var(--surface)',
  padding: '24px 20px 40px', maxHeight: '90vh', overflowY: 'auto',
  zIndex: 60,
};

// ── Small shared components ───────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
  );
}

function Skeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3 animate-pulse"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="h-5 rounded-lg w-3/4" style={{ backgroundColor: 'var(--surface2)' }} />
      <div className="h-3 rounded-lg w-1/3" style={{ backgroundColor: 'var(--surface2)' }} />
      <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--surface2)' }} />
      <div className="h-12 rounded-xl" style={{ backgroundColor: 'var(--surface2)' }} />
    </div>
  );
}

// ── Trip Summary Modal ────────────────────────────────────────────────────────
function TripSummaryModal({ trip, onClose }) {
  const stops = trip.stops ?? [];
  const totalEstimated = stops.reduce((sum, s) =>
    sum + (s.items ?? []).reduce((si, i) => si + (Number(i.estimatedPrice) * Number(i.quantity) || 0), 0), 0);
  const totalActual = stops.reduce((sum, s) => sum + (Number(s.actualSpend) || 0), 0);
  const duration = formatDuration(trip.startedAt, trip.completedAt);
  const issues  = stops.filter((s) => s.status === 'issue');
  const receipts = stops.filter((s) => s.receiptPhotoUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl shadow-2xl overflow-y-auto"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4"
          style={{ backgroundColor: 'var(--border)' }} />

        {/* Orange header */}
        <div className="text-center pb-5 px-6" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-4xl mb-2">🏁</div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Trip Complete!</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>{trip.title}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {duration && (
              <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--surface2)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-sub)' }}>Time</p>
                <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{duration}</p>
              </div>
            )}
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--surface2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-sub)' }}>Stops</p>
              <p className="font-bold text-sm" style={{ color: '#16A34A' }}>
                {stops.filter((s) => s.status === 'done').length}/{stops.length}
              </p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--surface2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-sub)' }}>Spent</p>
              <p className="font-bold text-sm" style={{ color: '#F97316' }}>₹{totalActual}</p>
            </div>
          </div>

          {/* Per-stop spend */}
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Spend per stop</p>
            {stops.map((s, idx) => {
              const est = (s.items ?? []).reduce((sum, i) => sum + (Number(i.estimatedPrice) * Number(i.quantity) || 0), 0);
              return (
                <div key={s.id ?? idx} className="flex items-center justify-between py-2 text-sm"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="truncate flex-1" style={{ color: 'var(--text)' }}>
                    {idx + 1}. {s.placeName || `Stop ${idx + 1}`}
                  </span>
                  <div className="flex gap-3 flex-shrink-0 text-xs ml-2">
                    {est > 0 && <span style={{ color: 'var(--text-faint)' }}>est ₹{est}</span>}
                    <span className="font-semibold" style={{ color: '#F97316' }}>₹{s.actualSpend || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Receipt photos */}
          {receipts.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Receipts</p>
              <div className="grid grid-cols-3 gap-2">
                {receipts.map((s, idx) => (
                  <a key={s.id ?? idx} href={s.receiptPhotoUrl} target="_blank" rel="noreferrer">
                    <img src={s.receiptPhotoUrl} alt="Receipt"
                      className="w-full rounded-xl object-cover" style={{ height: 80 }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#DC2626' }}>⚠ Issues</p>
              {issues.map((s, idx) => (
                <div key={s.id ?? idx} className="rounded-xl p-3 mb-2 text-sm"
                  style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <p className="font-semibold" style={{ color: '#DC2626' }}>{s.placeName || `Stop ${idx + 1}`}</p>
                  <p className="mt-0.5" style={{ color: '#7F1D1D' }}>{s.issueNote}</p>
                </div>
              ))}
            </div>
          )}

          <button onClick={onClose}
            className="w-full rounded-xl text-white font-bold text-base"
            style={{ height: 56, background: 'linear-gradient(135deg, #F97316, #EA580C)' }}>
            Done 🎉
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trip Card (list view) ─────────────────────────────────────────────────────
function TripCard({ trip, onStart, onContinue }) {
  const doneStops  = (trip.stops ?? []).filter((s) => s.status === 'done').length;
  const totalStops = (trip.stops ?? []).length;
  const spent      = trip.budgetSpent ?? 0;
  const budget     = trip.budget ?? 0;
  const spentPct   = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
  const isActive   = trip.status === 'in_progress';

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{
        backgroundColor: 'var(--surface)',
        border: isActive ? '2px solid #F97316' : '1px solid var(--border)',
        boxShadow: isActive ? '0 0 0 4px rgba(249,115,22,0.1)' : 'var(--shadow)',
      }}>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-tight" style={{ color: 'var(--text)' }}>
            {trip.title}
          </h3>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>
            {trip.type === 'procurement' ? '🛒 Procurement' : '🚚 Delivery'}
          </p>
        </div>
        <StatusPill status={trip.status} />
      </div>

      {totalStops > 0 && (
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          📍 {doneStops}/{totalStops} stops done
        </p>
      )}

      {budget > 0 && (
        <div>
          <div className="flex justify-between text-sm mb-1.5" style={{ color: 'var(--text-sub)' }}>
            <span>Budget</span>
            <span style={{ color: 'var(--text)' }}>₹{spent} / ₹{budget}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${spentPct}%`, backgroundColor: spentPct > 90 ? '#EF4444' : '#F97316' }} />
          </div>
        </div>
      )}

      {trip.status === 'pending' && (
        <button onClick={() => onStart(trip)}
          className="w-full rounded-xl text-white font-bold text-base active:opacity-90 transition-opacity"
          style={{ height: 52, backgroundColor: '#F97316' }}>
          ▶ Start Trip
        </button>
      )}
      {trip.status === 'in_progress' && (
        <button onClick={() => onContinue(trip)}
          className="w-full rounded-xl text-white font-bold text-base active:opacity-90 transition-opacity"
          style={{ height: 52, backgroundColor: '#0D9488' }}>
          Continue →
        </button>
      )}
    </div>
  );
}

// ── Stop Card (active trip view) ──────────────────────────────────────────────
function StopCard({ stop, idx, isCurrent, onNavigate, onMarkDone, onReportIssue }) {
  const isDone   = stop.status === 'done';
  const isIssue  = stop.status === 'issue';

  let borderColor = 'var(--border)';
  if (isDone)    borderColor = '#16A34A';
  else if (isIssue)  borderColor = '#DC2626';
  else if (isCurrent) borderColor = '#F97316';

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{
        backgroundColor: 'var(--surface)',
        border: `2px solid ${borderColor}`,
        boxShadow: isCurrent ? '0 0 0 4px rgba(249,115,22,0.1)' : 'none',
        opacity: (!isCurrent && !isDone && !isIssue) ? 0.6 : 1,
      }}>

      {/* Stop header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: isDone ? '#16A34A' : isIssue ? '#DC2626' : '#F97316' }}>
          {isDone ? '✓' : isIssue ? '!' : idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight" style={{ color: 'var(--text)' }}>
            {stop.placeName || `Stop ${idx + 1}`}
          </p>
          {stop.address && (
            <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text-sub)' }}>
              {stop.address}
            </p>
          )}
        </div>
      </div>

      {/* Done / Issue summary */}
      {isDone && (
        <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>
          ✓ Done{stop.actualSpend ? ` • ₹${stop.actualSpend} spent` : ''}
        </p>
      )}
      {isIssue && stop.issueNote && (
        <p className="text-sm" style={{ color: '#DC2626' }}>
          ⚠ {stop.issueNote.length > 80 ? stop.issueNote.slice(0, 80) + '…' : stop.issueNote}
        </p>
      )}

      {/* Expanded content — current stop */}
      {isCurrent && (
        <>
          {/* Items */}
          {(stop.items ?? []).length > 0 && (
            <div className="rounded-xl p-3 space-y-1.5"
              style={{ backgroundColor: 'var(--surface2)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-faint)' }}>
                ITEMS TO COLLECT
              </p>
              {stop.items.map((item, i) => (
                <div key={item.id ?? i} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text)' }}>
                    {item.name} {item.quantity ? `× ${item.quantity}` : ''} {item.unit || ''}
                  </span>
                  {item.estimatedPrice && (
                    <span style={{ color: 'var(--text-sub)' }}>₹{item.estimatedPrice}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onNavigate}
              className="rounded-xl font-semibold text-sm active:opacity-80 transition-opacity"
              style={{ height: 52, backgroundColor: '#EFF6FF', color: '#2563EB' }}>
              📍 Navigate
            </button>
            <button onClick={onMarkDone}
              className="rounded-xl font-semibold text-sm active:opacity-80 transition-opacity"
              style={{ height: 52, backgroundColor: '#F0FDF4', color: '#16A34A' }}>
              ✅ Mark Done
            </button>
            <button onClick={onReportIssue}
              className="rounded-xl font-semibold text-sm active:opacity-80 transition-opacity"
              style={{ height: 52, backgroundColor: '#FFF7ED', color: '#EA580C' }}>
              ⚠️ Issue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Active Trip View ──────────────────────────────────────────────────────────
function ActiveTripView({ trip, onBack, onMarkDone, onReportIssue, onComplete }) {
  const stops     = trip.stops ?? [];
  const doneCount = stops.filter((s) => s.status === 'done' || s.status === 'issue').length;
  const allDone   = stops.length > 0 && stops.every((s) => s.status === 'done' || s.status === 'issue');
  const spent     = trip.budgetSpent ?? 0;
  const budget    = trip.budget ?? 0;
  const remaining = budget - spent;
  const pct       = budget > 0 ? Math.min(100, Math.round(doneCount / stops.length * 100)) : 0;

  // Current stop = first non-done, non-issue stop
  const currentStopIdx = stops.findIndex((s) => s.status === 'pending');

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-5 space-y-4"
        style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold active:opacity-70"
          style={{ color: '#F97316' }}>
          ← Back to Trips
        </button>

        <div className="flex items-start justify-between gap-2">
          <h1 className="font-bold text-xl leading-tight" style={{ color: 'var(--text)' }}>
            {trip.title}
          </h1>
          <StatusPill status={trip.status} />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-2" style={{ color: 'var(--text-sub)' }}>
            <span>{doneCount}/{stops.length} stops done</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #F97316, #EA580C)' }} />
          </div>
        </div>

        {/* Budget */}
        {budget > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--text-sub)' }}>Budget remaining</span>
            <span className="font-bold text-base"
              style={{ color: remaining >= 0 ? '#F97316' : '#DC2626' }}>
              ₹{remaining}
            </span>
          </div>
        )}
      </div>

      {/* Stops */}
      <div className="px-4 py-4 space-y-3">
        {stops.map((stop, idx) => (
          <StopCard
            key={stop.id ?? idx}
            stop={stop}
            idx={idx}
            isCurrent={idx === currentStopIdx}
            onNavigate={() => {
              if (stop.address) {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`, '_blank');
              }
            }}
            onMarkDone={() => onMarkDone(stop)}
            onReportIssue={() => onReportIssue(stop)}
          />
        ))}

        {allDone && (
          <button onClick={onComplete}
            className="w-full rounded-2xl text-white font-bold text-lg active:opacity-90 transition-opacity mt-4"
            style={{ height: 60, background: 'linear-gradient(135deg, #F97316, #EA580C)' }}>
            🏁 Complete Trip
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mark Done Bottom Sheet ────────────────────────────────────────────────────
function MarkDoneSheet({ stop, onSubmit, onClose, submitting }) {
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [actualSpend,  setActualSpend]  = useState('');

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={onClose} />
      <div style={sheetStyle}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ backgroundColor: 'var(--border)' }} />

        <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>
          ✅ Mark Stop Done
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-sub)' }}>
          {stop.placeName || stop.address || 'Stop'}
        </p>

        {/* Photo capture */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
            📷 Receipt Photo (optional)
          </label>
          <label className="flex items-center justify-center gap-2 rounded-xl font-semibold text-base cursor-pointer active:opacity-80"
            style={{ height: 52, backgroundColor: 'rgba(249,115,22,0.1)', color: '#F97316', border: '2px dashed #F97316' }}>
            <span>📷 Take Photo</span>
            <input type="file" accept="image/*" capture="environment"
              className="hidden" onChange={handlePhoto} />
          </label>
          {photoPreview && (
            <img src={photoPreview} alt="Receipt preview"
              className="w-full rounded-xl mt-3 object-cover"
              style={{ maxHeight: 200 }} />
          )}
        </div>

        {/* Amount */}
        <div className="mb-5">
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
            Amount Spent (₹)
          </label>
          <input style={inputStyle} type="number" min="0" placeholder="0"
            value={actualSpend} onChange={(e) => setActualSpend(e.target.value)} />
        </div>

        <button onClick={() => onSubmit(photoFile, actualSpend)} disabled={submitting}
          className="w-full rounded-xl text-white font-bold text-base disabled:opacity-60 active:opacity-90"
          style={{ height: 56, backgroundColor: '#F97316' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        <button onClick={onClose} className="w-full mt-3 text-sm font-semibold py-3"
          style={{ color: 'var(--text-sub)' }}>
          Cancel
        </button>
      </div>
    </>
  );
}

// ── Report Issue Bottom Sheet ─────────────────────────────────────────────────
function ReportIssueSheet({ stop, issueNote, setIssueNote, onSubmit, onClose, submitting }) {
  const startVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input not supported on this device'); return; }
    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.onresult = (e) => setIssueNote(e.results[0][0].transcript);
    recognition.onerror = () => toast.error('Voice input failed');
    recognition.start();
  };

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={onClose} />
      <div style={sheetStyle}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ backgroundColor: 'var(--border)' }} />

        <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>
          ⚠️ Report Issue
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-sub)' }}>
          {stop.placeName || stop.address || 'Stop'}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
            What is the issue?
          </label>
          <textarea
            rows={4}
            placeholder="Describe the issue…"
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        <button onClick={startVoiceInput}
          className="w-full rounded-xl font-semibold text-base active:opacity-80 mb-4"
          style={{ height: 52, backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }}>
          🎤 Voice Input
        </button>

        <button onClick={onSubmit} disabled={submitting || !issueNote.trim()}
          className="w-full rounded-xl text-white font-bold text-base disabled:opacity-60 active:opacity-90"
          style={{ height: 56, backgroundColor: '#F97316' }}>
          {submitting ? 'Submitting…' : 'Submit Issue'}
        </button>
        <button onClick={onClose} className="w-full mt-3 text-sm font-semibold py-3"
          style={{ color: 'var(--text-sub)' }}>
          Cancel
        </button>
      </div>
    </>
  );
}

// ── Complete Trip Confirm ─────────────────────────────────────────────────────
function CompleteTripModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏁</div>
          <h3 className="font-bold text-xl mb-2" style={{ color: 'var(--text)' }}>
            Complete Trip?
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
            All stops are done. Mark this trip as completed?
          </p>
        </div>
        <div className="space-y-3">
          <button onClick={onConfirm}
            className="w-full rounded-xl text-white font-bold text-base active:opacity-90"
            style={{ height: 56, background: 'linear-gradient(135deg, #F97316, #EA580C)' }}>
            Complete Trip
          </button>
          <button onClick={onClose}
            className="w-full rounded-xl font-semibold text-base active:opacity-80"
            style={{ height: 52, backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }}>
            Keep Going
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  const { user, userProfile } = useAuth();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [trips,               setTrips]               = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [filter,              setFilter]              = useState('active');
  const [activeTripView,      setActiveTripView]      = useState(null);
  const [markDoneStop,        setMarkDoneStop]        = useState(null);
  const [reportIssueStop,     setReportIssueStop]     = useState(null);
  const [issueNote,           setIssueNote]           = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [summaryTrip,         setSummaryTrip]         = useState(null);
  const [submitting,          setSubmitting]          = useState(false);
  const [notifications,       setNotifications]       = useState([]);
  const [staffDocId,          setStaffDocId]          = useState(null);

  // ── GPS refs ─────────────────────────────────────────────────────────────────
  const watchIdRef      = useRef(null);
  const lastGpsUpdateRef = useRef(0);

  // ── Firebase subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'trips'), where('assignedDriver', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const order = { in_progress: 0, pending: 1, completed: 2, cancelled: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
      setTrips(list);
      setLoading(false);
      // Keep active trip view in sync with Firestore
      setActiveTripView((prev) => {
        if (!prev) return null;
        return list.find((t) => t.id === prev.id) ?? null;
      });
    }, () => setLoading(false));
    return unsub;
  }, [user?.uid]);

  // ── Staff doc subscription (for notifications) ────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'staff'), where('authUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setStaffDocId(d.id);
        setNotifications(d.data().pendingNotifications ?? []);
      }
    });
    return unsub;
  }, [user?.uid]);

  // ── GPS tracking ──────────────────────────────────────────────────────────────
  const startGpsTracking = useCallback((tripId) => {
    if (!navigator.geolocation || watchIdRef.current != null) return;
    const tripRef = doc(db, 'trips', tripId);
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastGpsUpdateRef.current < 30000) return;
        lastGpsUpdateRef.current = now;
        updateDoc(tripRef, {
          driverLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            updatedAt: serverTimestamp(),
          },
        }).catch(() => {});
      },
      (error) => console.log('GPS error:', error),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    watchIdRef.current = id;
  }, []);

  const stopGpsTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (activeTripView?.status === 'in_progress') {
      startGpsTracking(activeTripView.id);
    } else {
      stopGpsTracking();
    }
  }, [activeTripView?.id, activeTripView?.status, startGpsTracking, stopGpsTracking]);

  useEffect(() => () => stopGpsTracking(), [stopGpsTracking]);

  // ── Trip actions ─────────────────────────────────────────────────────────────
  const handleStartTrip = async (trip) => {
    try {
      await updateDoc(doc(db, 'trips', trip.id), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
      });
      setActiveTripView({ ...trip, status: 'in_progress' });
      toast.success('Trip started!');
    } catch {
      toast.error('Failed to start trip');
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeTripView) return;
    try {
      await updateDoc(doc(db, 'trips', activeTripView.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });
      stopGpsTracking();
      const completedTrip = { ...activeTripView, status: 'completed', completedAt: new Date() };
      setActiveTripView(null);
      setShowCompleteConfirm(false);
      setSummaryTrip(completedTrip);
    } catch {
      toast.error('Failed to complete trip');
    }
  };

  const handleMarkDoneSubmit = async (photoFile, actualSpend) => {
    if (!markDoneStop || !activeTripView) return;
    setSubmitting(true);
    try {
      let receiptPhotoUrl = '';
      if (photoFile) {
        const path = `tripReceipts/${activeTripView.id}/${markDoneStop.id}/${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photoFile);
        receiptPhotoUrl = await getDownloadURL(storageRef);
      }
      const updatedStops = (activeTripView.stops ?? []).map((s) =>
        s.id === markDoneStop.id
          ? { ...s, status: 'done', receiptPhotoUrl, actualSpend: Number(actualSpend) || 0, completedAt: new Date().toISOString() }
          : s
      );
      const budgetSpent = updatedStops.reduce((sum, s) => sum + (Number(s.actualSpend) || 0), 0);
      await updateDoc(doc(db, 'trips', activeTripView.id), { stops: updatedStops, budgetSpent });
      setMarkDoneStop(null);
      toast.success('Stop marked done! ✅');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update stop');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportIssueSubmit = async () => {
    if (!reportIssueStop || !activeTripView || !issueNote.trim()) return;
    setSubmitting(true);
    try {
      const updatedStops = (activeTripView.stops ?? []).map((s) =>
        s.id === reportIssueStop.id ? { ...s, status: 'issue', issueNote } : s
      );
      await updateDoc(doc(db, 'trips', activeTripView.id), { stops: updatedStops });
      setReportIssueStop(null);
      setIssueNote('');
      toast.success('Issue reported');
    } catch {
      toast.error('Failed to report issue');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────────
  const activeTrip = trips.find((t) => t.status === 'in_progress');

  const filteredTrips = trips.filter((t) => {
    if (filter === 'active')    return t.status === 'pending' || t.status === 'in_progress';
    if (filter === 'upcoming')  return t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed' || t.status === 'cancelled';
    return true;
  });

  // ── Active trip detail view ───────────────────────────────────────────────────
  if (activeTripView) {
    return (
      <>
        <ActiveTripView
          trip={activeTripView}
          onBack={() => setActiveTripView(null)}
          onMarkDone={(stop) => setMarkDoneStop(stop)}
          onReportIssue={(stop) => { setReportIssueStop(stop); setIssueNote(''); }}
          onComplete={() => setShowCompleteConfirm(true)}
        />

        {markDoneStop && (
          <MarkDoneSheet
            stop={markDoneStop}
            onSubmit={handleMarkDoneSubmit}
            onClose={() => setMarkDoneStop(null)}
            submitting={submitting}
          />
        )}

        {reportIssueStop && (
          <ReportIssueSheet
            stop={reportIssueStop}
            issueNote={issueNote}
            setIssueNote={setIssueNote}
            onSubmit={handleReportIssueSubmit}
            onClose={() => setReportIssueStop(null)}
            submitting={submitting}
          />
        )}

        {showCompleteConfirm && (
          <CompleteTripModal
            onConfirm={handleCompleteTrip}
            onClose={() => setShowCompleteConfirm(false)}
          />
        )}
      </>
    );
  }

  // ── Trip list view ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* Gradient header */}
      <div className="px-5 pt-8 pb-5"
        style={{ background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' }}>
        <p className="text-sm text-white/80 mb-0.5">{getGreeting()},</p>
        <h1 className="text-2xl font-bold text-white">{userProfile?.name ?? 'Driver'}</h1>
        <p className="text-sm text-white/70 mt-1">
          {trips.filter((t) => t.status === 'pending' || t.status === 'in_progress').length} active trips
        </p>
      </div>

      {/* Notification banners */}
      {notifications.map((notif, idx) => (
        <div key={idx} className="mx-4 mt-3 rounded-2xl p-4 shadow-md active:opacity-80 cursor-pointer"
          style={{ backgroundColor: '#FFF7ED', border: '2px solid #F97316' }}
          onClick={async () => {
            // Open the trip
            const trip = trips.find((t) => t.id === notif.tripId);
            if (trip) setActiveTripView(trip);
            // Clear this notification
            if (staffDocId) {
              await updateDoc(doc(db, 'staff', staffDocId), {
                pendingNotifications: arrayRemove(notif),
              }).catch(() => {});
            }
          }}>
          <p className="text-sm font-bold" style={{ color: '#EA580C' }}>
            📦 New trip assigned
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text)' }}>{notif.title}</p>
          <p className="text-xs mt-1 font-semibold" style={{ color: '#F97316' }}>Tap to view →</p>
        </div>
      ))}

      {/* Active trip banner */}
      {activeTrip && (
        <div className="mx-4 -mt-4 rounded-2xl p-4 shadow-lg animate-pulse"
          style={{ backgroundColor: '#FFF7ED', border: '2px solid #F97316' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: '#EA580C' }}>
            🟠 Trip in progress
          </p>
          <p className="font-bold text-base mb-3" style={{ color: 'var(--text)' }}>
            {activeTrip.title}
          </p>
          <button
            onClick={() => setActiveTripView(activeTrip)}
            className="w-full rounded-xl text-white font-bold text-base active:opacity-90"
            style={{ height: 52, backgroundColor: '#F97316' }}>
            Continue Trip →
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pt-5 pb-3">
        {[
          { key: 'active',    label: 'Today'     },
          { key: 'upcoming',  label: 'Upcoming'  },
          { key: 'completed', label: 'Completed' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{
              backgroundColor: filter === key ? '#F97316' : 'var(--surface)',
              color:           filter === key ? '#fff' : 'var(--text-sub)',
              border:          filter === key ? 'none' : '1px solid var(--border)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : filteredTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">🚗</div>
            <p className="font-semibold text-lg" style={{ color: 'var(--text)' }}>
              {filter === 'completed' ? 'No completed trips' : 'No trips assigned today'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
              {filter === 'completed' ? 'Completed trips will appear here' : 'Your manager will assign trips here'}
            </p>
          </div>
        ) : (
          filteredTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onStart={handleStartTrip}
              onContinue={(t) => setActiveTripView(t)}
            />
          ))
        )}
      </div>
    </div>
    {summaryTrip && <TripSummaryModal trip={summaryTrip} onClose={() => setSummaryTrip(null)} />}
    </>
  );
}
