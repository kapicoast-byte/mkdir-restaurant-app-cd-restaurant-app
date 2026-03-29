// Manager / Owner — Trip Management
//
// Features:
//  • Trip list with filter tabs: All | Pending | In Progress | Completed
//  • Create Trip modal: title, type, driver, budget, notes, stops with items
//  • Trip Detail modal: stops list, receipt photos, budget breakdown, live map
//  • Cancel trip with confirm
//  • Real-time via onSnapshot on /trips (filtered to branchId)
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function mapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  pending:     { bg: '#FFFBEB', color: '#CA8A04', label: 'Pending'     },
  in_progress: { bg: '#EFF6FF', color: '#2563EB', label: 'In Progress' },
  completed:   { bg: '#F0FDF4', color: '#16A34A', label: 'Completed'   },
  cancelled:   { bg: '#F9FAFB', color: '#6B7280', label: 'Cancelled'   },
};

const STOP_STATUS_STYLE = {
  pending: { color: 'var(--text-faint)', icon: '○' },
  done:    { color: '#16A34A',           icon: '✓' },
  issue:   { color: '#DC2626',           icon: '!' },
};

const FILTER_TABS = [
  { key: 'all',         label: 'All'         },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed'   },
];

const emptyStop = () => ({
  id: uid(),
  placeName: '',
  address: '',
  items: [],
  status: 'pending',
  receiptPhotoUrl: '',
  issueNote: '',
  completedAt: null,
  actualSpend: 0,
});

const emptyItem = () => ({ id: uid(), name: '', quantity: '', unit: '', estimatedPrice: '' });

const emptyForm = {
  title: '',
  type: 'procurement',
  assignedDriver: '',
  assignedDriverName: '',
  budget: '',
  notes: '',
  stops: [emptyStop()],
};

// ── Small shared components ───────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
  );
}

function TypeBadge({ type }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: type === 'procurement' ? '#F0FDF4' : '#EFF6FF',
               color: type === 'procurement' ? '#16A34A' : '#2563EB' }}>
      {type === 'procurement' ? '🛒 Procurement' : '🚚 Delivery'}
    </span>
  );
}

function DriverAvatar({ name }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ backgroundColor: '#06B6D4' }}>
      {getInitials(name)}
    </div>
  );
}

function BudgetBar({ spent, total }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((spent ?? 0) / total * 100));
  const color = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : 'var(--color-primary)';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-sub)' }}>
        <span>Budget</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>₹{spent ?? 0} / ₹{total}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Input helpers ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
};

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-sub)' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Stop editor (inside Create modal) ────────────────────────────────────────
function StopEditor({ stop, idx, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const updateField = (key, val) => onChange({ ...stop, [key]: val });

  const addItem = () => onChange({ ...stop, items: [...stop.items, emptyItem()] });
  const removeItem = (iid) => onChange({ ...stop, items: stop.items.filter((i) => i.id !== iid) });
  const updateItem = (iid, key, val) =>
    onChange({ ...stop, items: stop.items.map((i) => i.id === iid ? { ...i, [key]: val } : i) });

  return (
    <div className="rounded-xl p-3 space-y-3"
      style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>

      {/* Stop header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>Stop {idx + 1}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={idx === 0}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-sub)' }}>↑</button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-sub)' }}>↓</button>
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
            style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>✕</button>
        </div>
      </div>

      <Field label="Place name">
        <input style={inputStyle} value={stop.placeName}
          onChange={(e) => updateField('placeName', e.target.value)} placeholder="e.g. City Wholesale Market" />
      </Field>

      <Field label="Address">
        <div className="flex gap-2">
          <input style={{ ...inputStyle, flex: 1 }} value={stop.address}
            onChange={(e) => updateField('address', e.target.value)} placeholder="Full address" />
          {stop.address && (
            <a href={mapsSearchUrl(stop.address)} target="_blank" rel="noreferrer"
              className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
              Maps ↗
            </a>
          )}
        </div>
      </Field>

      {/* Items */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>Items to collect / deliver</p>
        {stop.items.map((item) => (
          <div key={item.id} className="flex gap-1.5 mb-1.5">
            <input style={{ ...inputStyle, flex: 2 }} value={item.name}
              onChange={(e) => updateItem(item.id, 'name', e.target.value)} placeholder="Item name" />
            <input style={{ ...inputStyle, flex: 1 }} value={item.quantity} type="number" min="0"
              onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} placeholder="Qty" />
            <input style={{ ...inputStyle, flex: 1 }} value={item.unit}
              onChange={(e) => updateItem(item.id, 'unit', e.target.value)} placeholder="Unit" />
            <input style={{ ...inputStyle, flex: 1 }} value={item.estimatedPrice} type="number" min="0"
              onChange={(e) => updateItem(item.id, 'estimatedPrice', e.target.value)} placeholder="₹" />
            <button type="button" onClick={() => removeItem(item.id)}
              className="flex-shrink-0 w-7 h-8 rounded-lg flex items-center justify-center text-xs"
              style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={addItem}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg mt-1"
          style={{ border: '1px dashed var(--border)', color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-faint)' }}>
          + Add Item
        </button>
      </div>
    </div>
  );
}

// ── Create Trip Modal ─────────────────────────────────────────────────────────
function CreateTripModal({ drivers, branchId, createdBy, onClose, onCreated }) {
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const updateStop = useCallback((idx, stop) => {
    setForm((f) => {
      const stops = [...f.stops];
      stops[idx] = stop;
      return { ...f, stops };
    });
  }, []);

  const addStop = () => setForm((f) => ({ ...f, stops: [...f.stops, emptyStop()] }));

  const removeStop = (idx) => setForm((f) => ({
    ...f, stops: f.stops.filter((_, i) => i !== idx),
  }));

  const moveStop = (idx, dir) => setForm((f) => {
    const stops = [...f.stops];
    const target = idx + dir;
    if (target < 0 || target >= stops.length) return f;
    [stops[idx], stops[target]] = [stops[target], stops[idx]];
    return { ...f, stops };
  });

  const handleDriverChange = (uid) => {
    const d = drivers.find((dr) => dr.authUid === uid || dr.id === uid);
    set('assignedDriver', uid);
    set('assignedDriverName', d?.name ?? '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Trip title is required');
    if (!form.assignedDriver) return toast.error('Please assign a driver');
    setSaving(true);
    try {
      const stopsClean = form.stops.map(({ id: _id, ...s }) => ({
        ...s,
        id: _id,
        items: s.items.map(({ id: _iid, ...item }) => ({ ...item, id: _iid })),
      }));
      await addDoc(collection(db, 'trips'), {
        title:               form.title.trim(),
        type:                form.type,
        assignedDriver:      form.assignedDriver,
        assignedDriverName:  form.assignedDriverName,
        branchId:            branchId ?? null,
        status:              'pending',
        budget:              Number(form.budget) || 0,
        budgetSpent:         0,
        createdBy:           createdBy,
        createdAt:           serverTimestamp(),
        startedAt:           null,
        completedAt:         null,
        driverLocation:      null,
        stops:               stopsClean,
        notes:               form.notes.trim(),
      });
      toast.success('Trip created');
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create trip');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-xl my-8 rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Create Trip</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-sub)' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Title */}
          <Field label="Trip title *">
            <input style={inputStyle} required value={form.title}
              onChange={(e) => set('title', e.target.value)} placeholder="e.g. Morning Market Run" />
          </Field>

          {/* Type + Driver row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select style={inputStyle} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="procurement">Procurement</option>
                <option value="delivery">Delivery</option>
              </select>
            </Field>
            <Field label="Assign driver *">
              <select style={inputStyle} value={form.assignedDriver}
                onChange={(e) => handleDriverChange(e.target.value)}>
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.authUid ?? d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Budget + Notes row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget (₹)">
              <input style={inputStyle} type="number" min="0" value={form.budget}
                onChange={(e) => set('budget', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Notes">
              <input style={inputStyle} value={form.notes}
                onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes…" />
            </Field>
          </div>

          {/* Stops */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Stops</p>
              <button type="button" onClick={addStop}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                + Add Stop
              </button>
            </div>
            <div className="space-y-3">
              {form.stops.map((stop, idx) => (
                <StopEditor key={stop.id} stop={stop} idx={idx} total={form.stops.length}
                  onChange={(s) => updateStop(idx, s)}
                  onRemove={() => removeStop(idx)}
                  onMoveUp={() => moveStop(idx, -1)}
                  onMoveDown={() => moveStop(idx, 1)} />
              ))}
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={saving}
            className="w-full py-3.5 rounded-xl text-white font-bold text-base disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? 'Creating…' : 'Create Trip'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Trip Detail Modal ─────────────────────────────────────────────────────────
function TripDetailModal({ trip, onClose, onStatusChange }) {
  const [enlargedPhoto, setEnlargedPhoto] = useState(null);
  const [cancelling,    setCancelling]    = useState(false);
  const [showCancel,    setShowCancel]    = useState(false);

  const loc = trip.driverLocation;
  const hasLocation = loc?.lat && loc?.lng;

  const totalEstimated = (trip.stops ?? []).reduce((sum, s) => {
    return sum + (s.items ?? []).reduce((si, i) => si + (Number(i.estimatedPrice) * Number(i.quantity) || 0), 0);
  }, 0);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await updateDoc(doc(db, 'trips', trip.id), { status: 'cancelled' });
      toast.success('Trip cancelled');
      setShowCancel(false);
      onClose();
    } catch {
      toast.error('Failed to cancel trip');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-xl my-8 rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{trip.title}</h2>
              <StatusPill status={trip.status} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={trip.type} />
              <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                Created {formatTs(trip.createdAt)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-sub)' }}>✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Driver */}
          <div className="flex items-center gap-3">
            <DriverAvatar name={trip.assignedDriverName} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{trip.assignedDriverName}</p>
              <p className="text-xs" style={{ color: 'var(--text-sub)' }}>Assigned driver</p>
            </div>
            {loc?.updatedAt && (
              <span className="ml-auto text-xs" style={{ color: 'var(--text-faint)' }}>
                📍 Updated {formatTs(loc.updatedAt)}
              </span>
            )}
          </div>

          {/* Budget */}
          {trip.budget > 0 && (
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <BudgetBar spent={trip.budgetSpent} total={trip.budget} />
              <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-sub)' }}>
                <span>Estimated total: ₹{totalEstimated}</span>
                <span>Actual spent: ₹{trip.budgetSpent ?? 0}</span>
              </div>
            </div>
          )}

          {/* Live map — OpenStreetMap embed, no API key required */}
          {hasLocation && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>Driver Location</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <iframe
                  title="driver-map"
                  width="100%"
                  height="220"
                  frameBorder="0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - 0.01},${loc.lat - 0.01},${loc.lng + 0.01},${loc.lat + 0.01}&layer=mapnik&marker=${loc.lat},${loc.lng}`}
                  style={{ display: 'block' }}
                />
              </div>
              <a
                href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                target="_blank" rel="noreferrer"
                className="text-xs font-semibold mt-1 inline-block"
                style={{ color: 'var(--color-primary)' }}
              >
                Open in Google Maps ↗
              </a>
            </div>
          )}

          {/* Stops */}
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
              Stops ({(trip.stops ?? []).filter((s) => s.status === 'done').length}/{(trip.stops ?? []).length} done)
            </p>
            <div className="space-y-3">
              {(trip.stops ?? []).map((stop, idx) => {
                const ss = STOP_STATUS_STYLE[stop.status] ?? STOP_STATUS_STYLE.pending;
                const stopEstimate = (stop.items ?? []).reduce(
                  (sum, i) => sum + (Number(i.estimatedPrice) * Number(i.quantity) || 0), 0
                );
                return (
                  <div key={stop.id ?? idx} className="rounded-xl overflow-hidden"
                    style={{
                      border: stop.status === 'issue' ? '1px solid #FECACA' : '1px solid var(--border)',
                      backgroundColor: stop.status === 'done' ? '#F0FDF4' : stop.status === 'issue' ? '#FEF2F2' : 'var(--surface2)',
                    }}>
                    <div className="px-4 py-3">
                      {/* Stop header */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold w-5 text-center" style={{ color: ss.color }}>{ss.icon}</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {idx + 1}. {stop.placeName || '—'}
                            </p>
                            {stop.address && (
                              <a href={mapsSearchUrl(stop.address)} target="_blank" rel="noreferrer"
                                className="text-xs" style={{ color: '#2563EB' }}>
                                {stop.address} ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {stop.actualSpend > 0 && (
                            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                              ₹{stop.actualSpend}
                            </span>
                          )}
                          {stopEstimate > 0 && (
                            <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                              (est. ₹{stopEstimate})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items list */}
                      {(stop.items ?? []).length > 0 && (
                        <div className="ml-7 mt-2 space-y-0.5">
                          {stop.items.map((item, ii) => (
                            <p key={item.id ?? ii} className="text-xs" style={{ color: 'var(--text-sub)' }}>
                              • {item.name} — {item.quantity} {item.unit}
                              {item.estimatedPrice ? ` (₹${item.estimatedPrice} ea.)` : ''}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Issue note */}
                      {stop.status === 'issue' && stop.issueNote && (
                        <div className="ml-7 mt-2 px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                          <p className="text-xs font-semibold mb-0.5" style={{ color: '#DC2626' }}>Issue reported</p>
                          <p className="text-xs" style={{ color: '#DC2626' }}>{stop.issueNote}</p>
                        </div>
                      )}

                      {/* Receipt photo */}
                      {stop.receiptPhotoUrl && (
                        <div className="ml-7 mt-2">
                          <img
                            src={stop.receiptPhotoUrl}
                            alt="receipt"
                            className="h-20 w-auto rounded-lg object-cover cursor-pointer"
                            style={{ border: '1px solid var(--border)' }}
                            onClick={() => setEnlargedPhoto(stop.receiptPhotoUrl)}
                          />
                        </div>
                      )}

                      {stop.completedAt && (
                        <p className="ml-7 mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                          Completed {formatTs(stop.completedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          {trip.notes && (
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-sub)' }}>Notes</p>
              <p className="text-sm" style={{ color: 'var(--text)' }}>{trip.notes}</p>
            </div>
          )}

          {/* Actions */}
          {(trip.status === 'pending' || trip.status === 'in_progress') && (
            <button
              onClick={() => setShowCancel(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: '#FEF2F2' }}
            >
              Cancel Trip
            </button>
          )}
        </div>
      </div>

      {/* Enlarged photo overlay */}
      {enlargedPhoto && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setEnlargedPhoto(null)}>
          <img src={enlargedPhoto} alt="receipt" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      {/* Cancel confirm */}
      {showCancel && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--surface)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Cancel this trip?</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} disabled={cancelling}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}>
                Keep Trip
              </button>
              <button onClick={handleCancel} disabled={cancelling}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: '#DC2626' }}>
                {cancelling ? '…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trip Card ─────────────────────────────────────────────────────────────────
function TripCard({ trip, onView }) {
  const doneStops  = (trip.stops ?? []).filter((s) => s.status === 'done').length;
  const totalStops = (trip.stops ?? []).length;
  const hasIssue   = (trip.stops ?? []).some((s) => s.status === 'issue');

  return (
    <div
      className="rounded-2xl p-4 cursor-pointer transition-shadow"
      style={{
        backgroundColor: 'var(--surface)',
        border: trip.status === 'in_progress' ? '1.5px solid #2563EB' : hasIssue ? '1.5px solid #FECACA' : '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
      onClick={onView}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--text)' }}>{trip.title}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <TypeBadge type={trip.type} />
            {hasIssue && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>⚠ Issue</span>
            )}
          </div>
        </div>
        <StatusPill status={trip.status} />
      </div>

      {/* Driver */}
      <div className="flex items-center gap-2 mb-3">
        <DriverAvatar name={trip.assignedDriverName} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>{trip.assignedDriverName}</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-faint)' }}>
          📍 {doneStops}/{totalStops} stops
        </span>
      </div>

      {/* Budget */}
      <BudgetBar spent={trip.budgetSpent} total={trip.budget} />

      {/* Footer */}
      <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
        {formatTs(trip.createdAt)}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Trips() {
  const { userProfile, user, branchId } = useAuth();

  const [trips,       setTrips]       = useState([]);
  const [drivers,     setDrivers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterTab,   setFilterTab]   = useState('all');
  const [showCreate,  setShowCreate]  = useState(false);
  const [detailTrip,  setDetailTrip]  = useState(null);

  const isOwner = userProfile?.role === 'owner';

  // ── Firestore: trips ──────────────────────────────────────────────────────
  useEffect(() => {
    const constraints = [orderBy('createdAt', 'desc')];
    // Owner sees all trips; manager filters to their branch
    if (!isOwner && branchId) {
      constraints.unshift(where('branchId', '==', branchId));
    }
    const q = query(collection(db, 'trips'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [isOwner, branchId]);

  // ── Firestore: drivers ────────────────────────────────────────────────────
  useEffect(() => {
    const constraints = [where('role', '==', 'driver')];
    if (!isOwner && branchId) constraints.push(where('branchId', '==', branchId));
    const q = query(collection(db, 'staff'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [isOwner, branchId]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = filterTab === 'all'
    ? trips
    : trips.filter((t) => t.status === filterTab);

  const counts = {
    all:         trips.length,
    pending:     trips.filter((t) => t.status === 'pending').length,
    in_progress: trips.filter((t) => t.status === 'in_progress').length,
    completed:   trips.filter((t) => t.status === 'completed').length,
  };

  return (
    <div className="p-6" style={{ backgroundColor: 'var(--bg)', minHeight: '100%' }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Trips</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>
            Manage driver trips and procurement runs
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          + Create Trip
        </button>
      </div>

      {/* ── Filter tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide pb-1">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTab(key)}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={filterTab === key
              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
              : { backgroundColor: 'var(--surface)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
            }
          >
            {label}
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
              style={filterTab === key
                ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                : { backgroundColor: 'var(--surface2)', color: 'var(--text-faint)' }
              }
            >
              {counts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Trip list ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
            style={{ backgroundColor: 'var(--surface)' }}>🚗</div>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No trips found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
            {filterTab === 'all' ? 'Create a trip to get started' : `No ${filterTab.replace('_', ' ')} trips`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} onView={() => setDetailTrip(trip)} />
          ))}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateTripModal
          drivers={drivers}
          branchId={branchId}
          createdBy={user?.uid}
          onClose={() => setShowCreate(false)}
          onCreated={() => {}}
        />
      )}

      {detailTrip && (
        <TripDetailModal
          trip={detailTrip}
          onClose={() => setDetailTrip(null)}
          onStatusChange={() => {}}
        />
      )}
    </div>
  );
}
