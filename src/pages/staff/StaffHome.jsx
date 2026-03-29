// Staff Home — real-time task list for the signed-in staff member.
//
// Sections:
//  • Orange gradient greeting card — name, date, today's shift
//  • Filter pills — All / Pending / Overdue / Done
//  • Task list — real-time via onSnapshot, sorted overdue-first then by dueTime
//  • Bottom-sheet modals:
//      – Confirm Done (no photo required)
//      – Camera / photo capture (requiresPhoto=true) → uploads to Firebase Storage
//      – Flag Problem (textarea + Web Speech API voice input)
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: Timestamp.fromDate(start),
    end:   Timestamp.fromDate(end),
  };
}

function formatDate(date, lang) {
  try {
    return date.toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function isOverdue(task) {
  if (!task.dueTime) return false;
  if (['completed', 'flagged', 'pending photo review', 'photo rejected'].includes(task.status)) return false;
  const due = task.dueTime?.toDate ? task.dueTime.toDate() : new Date(task.dueTime);
  return due < new Date();
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aOver = isOverdue(a);
    const bOver = isOverdue(b);
    if (aOver && !bOver) return -1;
    if (!aOver && bOver)  return  1;
    if (!a.dueTime && !b.dueTime) return 0;
    if (!a.dueTime) return  1;
    if (!b.dueTime) return -1;
    const aT = a.dueTime?.toDate ? a.dueTime.toDate() : new Date(a.dueTime);
    const bT = b.dueTime?.toDate ? b.dueTime.toDate() : new Date(b.dueTime);
    return aT - bT;
  });
}

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  cleaning:    { icon: '🧹', bg: '#EFF6FF', color: '#2563EB'  },
  kitchen:     { icon: '🍳', bg: '#FFF7ED', color: '#EA580C'  },
  service:     { icon: '🛎️', bg: '#F0FDF4', color: '#16A34A'  },
  stock:       { icon: '📦', bg: '#F5F3FF', color: '#7C3AED'  },
  maintenance: { icon: '🔧', bg: '#FEF2F2', color: '#DC2626'  },
  general:     { icon: '📋', bg: '#F9FAFB', color: '#6B7280'  },
};

function typeConfig(type) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.general;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ task }) {
  const over = isOverdue(task);
  const style = (bg, color) => ({
    backgroundColor: bg,
    color,
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px',
  });

  if (over)
    return <span style={style('#FEF2F2', '#DC2626')}>Overdue</span>;
  switch (task.status) {
    case 'completed':
      return <span style={style('#F0FDF4', '#16A34A')}>Done</span>;
    case 'in progress':
      return <span style={style('#EFF6FF', '#2563EB')}>In Progress</span>;
    case 'flagged':
      return <span style={style('#FFF7ED', '#EA580C')}>Flagged</span>;
    case 'pending photo review':
      return <span style={style('#F5F3FF', '#7C3AED')}>Photo Review</span>;
    case 'photo rejected':
      return <span style={style('#FEF2F2', '#DC2626')}>Photo Rejected</span>;
    default:
      return <span style={style('#FFFBEB', '#CA8A04')}>Pending</span>;
  }
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, t, onMarkDone, onFlag, onRetakePhoto }) {
  const { icon, bg, color } = typeConfig(task.type);
  const hideButtons       = task.status === 'completed' || task.status === 'pending photo review';
  const isPhotoRejected   = task.status === 'photo rejected';

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: isPhotoRejected ? '2px solid #FECACA' : '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Top row: icon + title + badge */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
          style={{ backgroundColor: bg, color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-sm leading-tight flex-1" style={{ color: 'var(--text)' }}>
              {task.title}
            </h3>
            <StatusBadge task={task} />
          </div>
          {task.dueTime && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
              {t('dueAt')} {formatTime(task.dueTime)}
            </p>
          )}
          {task.description && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-sub)' }}>
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* Rejection reason banner */}
      {isPhotoRejected && task.rejectionReason && (
        <div className="mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p className="text-xs font-semibold mb-0.5" style={{ color: '#DC2626' }}>{t('rejectionReason')}</p>
          <p className="text-xs" style={{ color: '#DC2626' }}>{task.rejectionReason}</p>
        </div>
      )}

      {/* Retake Photo button */}
      {isPhotoRejected && (
        <button
          onClick={() => onRetakePhoto(task)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold active:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <span>📷</span> {t('retakePhoto')}
        </button>
      )}

      {/* Action buttons */}
      {!hideButtons && !isPhotoRejected && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onMarkDone(task)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-white text-sm font-semibold active:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            ✓ {t('markDone')}
          </button>
          <button
            onClick={() => onFlag(task)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold active:opacity-80 transition-opacity"
            style={{ color: '#DC2626', border: '1px solid #FECACA', backgroundColor: '#FEF2F2' }}
          >
            🚨 {t('flagProblem')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Confirm Done Modal ────────────────────────────────────────────────────────
function ConfirmModal({ task, t, onConfirm, onClose, loading }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"
            style={{ backgroundColor: 'var(--color-primary-faint)' }}
          >
            ✓
          </div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{t('confirmDone')}</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>{task?.title}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {loading ? '…' : t('yesDone')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Camera / Photo Modal ──────────────────────────────────────────────────────
function PhotoModal({ task, t, onClose, onSubmit, loading }) {
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>{t('photoRequired')}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-sub)' }}>{task?.title}</p>

        <div
          className="w-full aspect-video rounded-xl mb-4 flex items-center justify-center overflow-hidden cursor-pointer"
          style={{ border: '2px dashed var(--border)', backgroundColor: 'var(--surface2)' }}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <div className="text-3xl mb-1">📷</div>
              <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{t('takePhoto')}</p>
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

        {photo && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-2 mb-3 text-sm rounded-xl"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('changePhoto')}
          </button>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => photo && onSubmit(photo)}
            disabled={!photo || loading}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {loading ? t('uploading') : t('submitPhoto')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flag Problem Modal ────────────────────────────────────────────────────────
function FlagModal({ task, t, lang, onClose, onSubmit, loading }) {
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  const startVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input not supported on this device.');
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = lang;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setNote((prev) => prev ? `${prev} ${transcript}` : transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend   = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }, [lang]);

  const stopVoice = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => () => recogRef.current?.abort(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>{t('whatProblem')}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-sub)' }}>{task?.title}</p>

        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('describeProblem')}
          className="w-full px-3 py-2.5 rounded-xl text-sm resize-none mb-3"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface2)',
            color: 'var(--text)',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          className="w-full flex items-center justify-center gap-2 py-2.5 mb-4 rounded-xl text-sm font-medium transition-colors"
          style={listening
            ? { backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }
            : { backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-sub)' }
          }
        >
          <span>🎤</span>
          {listening ? t('listening') : t('speakProblem')}
        </button>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => note.trim() && onSubmit(note.trim())}
            disabled={!note.trim() || loading}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {loading ? '…' : t('flagProblem')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 animate-pulse" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-xl flex-shrink-0" style={{ backgroundColor: 'var(--surface2)' }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded-lg w-3/4" style={{ backgroundColor: 'var(--surface2)' }} />
          <div className="h-3 rounded-lg w-1/2" style={{ backgroundColor: 'var(--surface2)' }} />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <div className="flex-1 h-10 rounded-xl" style={{ backgroundColor: 'var(--surface2)' }} />
        <div className="flex-1 h-10 rounded-xl" style={{ backgroundColor: 'var(--surface2)' }} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffHome() {
  const { t, lang } = useStaffCtx();
  const { userProfile, user } = useAuth();

  const [tasks,        setTasks]        = useState([]);
  const [shift,        setShift]        = useState(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [filterTab,    setFilterTab]    = useState('all'); // 'all' | 'pending' | 'overdue' | 'done'

  const [confirmTask,  setConfirmTask]  = useState(null);
  const [photoTask,    setPhotoTask]    = useState(null);
  const [flagTask,     setFlagTask]     = useState(null);
  const [isRetake,     setIsRetake]     = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const staffId = userProfile?.staffId;
  const authUid = user?.uid;

  // ── Firestore: today's tasks ─────────────────────────────────────────────
  useEffect(() => {
    if (!authUid) return;
    const { start, end } = todayRange();
    const q = query(
      collection(db, 'tasks'),
      where('assignedTo', '==', authUid),
      where('createdAt', '>=', start),
      where('createdAt', '<',  end),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(sortTasks(list));
      setTasksLoading(false);
    }, (err) => {
      console.error('Tasks onSnapshot error:', err.code, err.message);
      setTasksLoading(false);
    });
    return unsub;
  }, [authUid]);

  // ── Firestore: today's shift ─────────────────────────────────────────────
  useEffect(() => {
    if (!staffId) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'shifts'),
      where('assignedStaff', 'array-contains', staffId),
      where('date', '==', todayStr),
    );
    const unsub = onSnapshot(q, (snap) => {
      setShift(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
    return unsub;
  }, [staffId]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleMarkDone(task) {
    if (navigator.vibrate) navigator.vibrate(10);
    if (task.requiresPhoto) { setIsRetake(false); setPhotoTask(task); }
    else { setConfirmTask(task); }
  }

  function handleRetakePhoto(task) {
    setIsRetake(true);
    setPhotoTask(task);
  }

  async function confirmDone() {
    if (!confirmTask) return;
    setModalLoading(true);
    try {
      await updateDoc(doc(db, 'tasks', confirmTask.id), { status: 'completed' });
      toast.success(t('taskDone'));
      setConfirmTask(null);
    } catch {
      toast.error('Failed to update task.');
    } finally {
      setModalLoading(false);
    }
  }

  async function submitPhoto(file) {
    if (!photoTask) return;
    setModalLoading(true);
    console.log('Photo selected:', file?.name, file?.size);
    console.log('Task id:', photoTask.id);
    console.log('Current user uid:', authUid);
    console.log('Task assignedTo:', photoTask.assignedTo);
    console.log('Match (assignedTo === user.uid):', photoTask.assignedTo === authUid);
    if (!photoTask.id) {
      toast.error('Task ID missing — cannot upload photo.');
      setModalLoading(false);
      return;
    }
    let photoUrl;
    try {
      const storagePath = `taskPhotos/${photoTask.id}/${Date.now()}.jpg`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      photoUrl = await getDownloadURL(storageRef);
    } catch (storageError) {
      console.error('Storage error:', storageError);
      toast.error('Photo upload failed — please try again.');
      setModalLoading(false);
      return;
    }
    try {
      const update = isRetake
        ? { status: 'pending photo review', photoUrl, rejectionReason: null }
        : { status: 'pending photo review', photoUrl };
      await updateDoc(doc(db, 'tasks', photoTask.id), update);
      toast.success(t('taskDone'));
      setPhotoTask(null);
      setIsRetake(false);
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      toast.error('Photo saved but status update failed — please try again.');
    } finally {
      setModalLoading(false);
    }
  }

  async function submitFlag(note) {
    if (!flagTask) return;
    setModalLoading(true);
    try {
      await updateDoc(doc(db, 'tasks', flagTask.id), { status: 'flagged', flagNote: note });
      toast.success(t('problemReported'));
      setFlagTask(null);
    } catch (error) {
      console.log('Flag error:', error.code, error.message);
      toast.error('Failed to report problem.');
    } finally {
      setModalLoading(false);
    }
  }

  // ── Greeting ─────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('goodMorning') :
    hour < 17 ? t('goodAfternoon') :
                t('goodEvening');

  const shiftTime = shift ? `${shift.startTime ?? ''} – ${shift.endTime ?? ''}` : null;

  // ── Filter counts ─────────────────────────────────────────────────────────
  const counts = {
    all:     tasks.length,
    pending: tasks.filter((t) => !isOverdue(t) && t.status !== 'completed' && t.status !== 'flagged' && t.status !== 'pending photo review').length,
    overdue: tasks.filter(isOverdue).length,
    done:    tasks.filter((t) => t.status === 'completed').length,
  };

  const filteredTasks = filterTab === 'all'     ? tasks
    : filterTab === 'pending' ? tasks.filter((t) => !isOverdue(t) && t.status !== 'completed' && t.status !== 'flagged' && t.status !== 'pending photo review')
    : filterTab === 'overdue' ? tasks.filter(isOverdue)
    : tasks.filter((t) => t.status === 'completed');

  const FILTER_PILLS = [
    { key: 'all',     label: `All (${counts.all})`         },
    { key: 'pending', label: `Pending (${counts.pending})`  },
    { key: 'overdue', label: `Overdue (${counts.overdue})`  },
    { key: 'done',    label: `Done (${counts.done})`        },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Orange gradient greeting card ──────────────────────────── */}
      <div
        className="px-5 pt-12 pb-6"
        style={{ background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' }}
      >
        <p className="text-sm font-medium text-white/80 mb-0.5">{greeting}</p>
        <h1 className="text-2xl font-bold text-white">{userProfile?.name ?? '—'}</h1>
        <p className="text-xs mt-1 text-white/70">
          {formatDate(new Date(), lang)}
        </p>
        {shiftTime && (
          <div
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            🕐 {shiftTime}
          </div>
        )}
      </div>

      {/* ── Filter pills ───────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-1 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTER_PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTab(key)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
            style={filterTab === key
              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
              : { backgroundColor: 'var(--surface)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Task list ──────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        {tasksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              ✅
            </div>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{t('noTasksToday')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                t={t}
                onMarkDone={handleMarkDone}
                onFlag={(task) => setFlagTask(task)}
                onRetakePhoto={handleRetakePhoto}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {confirmTask && (
        <ConfirmModal
          task={confirmTask}
          t={t}
          loading={modalLoading}
          onConfirm={confirmDone}
          onClose={() => !modalLoading && setConfirmTask(null)}
        />
      )}

      {photoTask && (
        <PhotoModal
          task={photoTask}
          t={t}
          loading={modalLoading}
          onSubmit={submitPhoto}
          onClose={() => { if (!modalLoading) { setPhotoTask(null); setIsRetake(false); } }}
        />
      )}

      {flagTask && (
        <FlagModal
          task={flagTask}
          t={t}
          lang={lang}
          loading={modalLoading}
          onSubmit={submitFlag}
          onClose={() => !modalLoading && setFlagTask(null)}
        />
      )}
    </div>
  );
}
