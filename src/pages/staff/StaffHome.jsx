// Staff Home — real-time task list for the signed-in staff member.
//
// Sections:
//  • Header  — greeting, name, today's date, today's shift time
//  • Task list — real-time via onSnapshot, sorted overdue-first then by dueTime
//  • Modals:
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

// Start-of-today and start-of-tomorrow as Firestore Timestamps
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

// Returns true when a task is overdue (dueTime in the past, status not completed/flagged)
function isOverdue(task) {
  if (!task.dueTime) return false;
  if (['completed', 'flagged', 'pending photo review', 'photo rejected'].includes(task.status)) return false;
  const due = task.dueTime?.toDate ? task.dueTime.toDate() : new Date(task.dueTime);
  return due < new Date();
}

// Sort: overdue first, then ascending by dueTime, then tasks without dueTime at end
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
  cleaning:    { icon: '🧹', bg: 'bg-blue-100',   text: 'text-blue-700'   },
  kitchen:     { icon: '🍳', bg: 'bg-orange-100', text: 'text-orange-700' },
  service:     { icon: '🛎️', bg: 'bg-green-100',  text: 'text-green-700'  },
  stock:       { icon: '📦', bg: 'bg-purple-100', text: 'text-purple-700' },
  maintenance: { icon: '🔧', bg: 'bg-red-100',    text: 'text-red-700'    },
  general:     { icon: '📋', bg: 'bg-gray-100',   text: 'text-gray-700'   },
};

function typeConfig(type) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.general;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ task, th, t }) {
  const over = isOverdue(task);
  if (over) {
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${th.badgeOverdue}`}>{t('overdue')}</span>;
  }
  switch (task.status) {
    case 'completed':
      return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${th.badgeDone}`}>{t('completed')}</span>;
    case 'in progress':
      return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${th.badgeProgress}`}>{t('inProgress')}</span>;
    case 'flagged':
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{t('flagged')}</span>;
    case 'pending photo review':
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{t('pendingReview')}</span>;
    case 'photo rejected':
      return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${th.badgeOverdue}`}>{t('photoRejected')}</span>;
    default:
      return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${th.badgePending}`}>{t('pending')}</span>;
  }
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, th, t, onMarkDone, onFlag, onRetakePhoto }) {
  const { icon, bg } = typeConfig(task.type);
  const hideButtons       = task.status === 'completed' || task.status === 'pending photo review';
  const isPhotoRejected   = task.status === 'photo rejected';
  const cardBorder        = isPhotoRejected ? 'border-2 border-red-400' : `border ${th.border}`;

  return (
    <div className={`rounded-xl p-4 ${th.cardBg} ${cardBorder} shadow-sm`}>
      {/* Top row: icon + title + badge */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <span className="text-lg">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className={`font-semibold text-sm leading-tight ${th.text}`}>{task.title}</h3>
            <StatusBadge task={task} th={th} t={t} />
          </div>
          {task.dueTime && (
            <p className={`text-xs mt-0.5 ${th.textSub}`}>
              {t('dueAt')} {formatTime(task.dueTime)}
            </p>
          )}
          {task.description && (
            <p className={`text-xs mt-1 ${th.textSub} line-clamp-2`}>{task.description}</p>
          )}
        </div>
      </div>

      {/* Rejection reason banner */}
      {isPhotoRejected && task.rejectionReason && (
        <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-semibold text-red-700 mb-0.5">{t('rejectionReason')}</p>
          <p className="text-xs text-red-600">{task.rejectionReason}</p>
        </div>
      )}

      {/* Retake Photo button for rejected tasks */}
      {isPhotoRejected && (
        <button
          onClick={() => onRetakePhoto(task)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium active:bg-indigo-700 transition-colors"
        >
          <span>📷</span> {t('retakePhoto')}
        </button>
      )}

      {/* Standard action buttons */}
      {!hideButtons && !isPhotoRejected && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onMarkDone(task)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium active:bg-green-700 transition-colors"
          >
            <span>✅</span> {t('markDone')}
          </button>
          <button
            onClick={() => onFlag(task)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium active:bg-red-100 transition-colors"
          >
            <span>🚨</span> {t('flagProblem')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Confirm Done Modal (no photo) ─────────────────────────────────────────────
function ConfirmModal({ task, th, t, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${th.cardBg} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">✅</div>
          <h3 className={`font-bold text-lg ${th.text}`}>{t('confirmDone')}</h3>
          <p className={`text-sm mt-1 ${th.textSub}`}>{task?.title}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium ${th.border} ${th.text} disabled:opacity-50`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? '…' : t('yesDone')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Camera / Photo Modal ──────────────────────────────────────────────────────
function PhotoModal({ task, th, t, onClose, onSubmit, loading }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${th.cardBg} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`font-bold text-lg mb-1 ${th.text}`}>{t('photoRequired')}</h3>
        <p className={`text-sm mb-4 ${th.textSub}`}>{task?.title}</p>

        {/* Preview / capture area */}
        <div
          className={`w-full aspect-video rounded-xl mb-4 flex items-center justify-center border-2 border-dashed ${th.border} overflow-hidden`}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <div className="text-3xl mb-1">📷</div>
              <p className={`text-xs ${th.textSub}`}>{t('takePhoto')}</p>
            </div>
          )}
        </div>

        {/* Hidden file input — opens camera on mobile */}
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
            onClick={() => { fileRef.current?.click(); }}
            className={`w-full py-2 mb-3 text-sm border rounded-lg ${th.border} ${th.text}`}
          >
            {t('changePhoto')}
          </button>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium ${th.border} ${th.text} disabled:opacity-50`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => photo && onSubmit(photo)}
            disabled={!photo || loading}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? t('uploading') : t('submitPhoto')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flag Problem Modal ────────────────────────────────────────────────────────
function FlagModal({ task, th, t, lang, onClose, onSubmit, loading }) {
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

  // Cleanup on unmount
  useEffect(() => () => recogRef.current?.abort(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${th.cardBg} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`font-bold text-lg mb-1 ${th.text}`}>{t('whatProblem')}</h3>
        <p className={`text-sm mb-4 ${th.textSub}`}>{task?.title}</p>

        {/* Textarea */}
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('describeProblem')}
          className={`w-full px-3 py-2.5 rounded-xl border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${th.inputBg} ${th.inputBorder} ${th.inputText} mb-3`}
        />

        {/* Voice button */}
        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          className={`w-full flex items-center justify-center gap-2 py-2.5 mb-4 rounded-xl border text-sm font-medium transition-colors ${
            listening
              ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
              : `${th.altBg} ${th.border} ${th.text}`
          }`}
        >
          <span>🎤</span>
          {listening ? t('listening') : t('speakProblem')}
        </button>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium ${th.border} ${th.text} disabled:opacity-50`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => note.trim() && onSubmit(note.trim())}
            disabled={!note.trim() || loading}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? '…' : t('flagProblem')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffHome() {
  const { t, lang, th } = useStaffCtx();
  const { userProfile }  = useAuth();

  const [tasks,  setTasks]  = useState([]);
  const [shift,  setShift]  = useState(null);
  const [tasksLoading, setTasksLoading] = useState(true);

  // Modal state
  const [confirmTask,  setConfirmTask]  = useState(null);  // task for no-photo confirm
  const [photoTask,    setPhotoTask]    = useState(null);  // task for photo capture (new or retake)
  const [flagTask,     setFlagTask]     = useState(null);  // task for flag modal
  const [isRetake,     setIsRetake]     = useState(false); // true when reopening for a rejected photo
  const [modalLoading, setModalLoading] = useState(false);

  const staffId = userProfile?.staffId;

  // ── Firestore: today's tasks ─────────────────────────────────────────────
  useEffect(() => {
    if (!staffId) return;
    const { start, end } = todayRange();

    const q = query(
      collection(db, 'tasks'),
      where('assignedTo', '==', staffId),
      where('createdAt', '>=', start),
      where('createdAt', '<',  end),
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(sortTasks(list));
      setTasksLoading(false);
    }, () => setTasksLoading(false));

    return unsub;
  }, [staffId]);

  // ── Firestore: today's shift ─────────────────────────────────────────────
  useEffect(() => {
    if (!staffId) return;
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

  // ── Mark Done handler ────────────────────────────────────────────────────
  function handleMarkDone(task) {
    if (task.requiresPhoto) {
      setIsRetake(false);
      setPhotoTask(task);
    } else {
      setConfirmTask(task);
    }
  }

  // ── Retake Photo handler (photo rejected → reopen camera modal) ──────────
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
    try {
      const storageRef = ref(storage, `taskPhotos/${photoTask.id}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);
      // On retake: also clear rejectionReason
      const update = isRetake
        ? { status: 'pending photo review', photoUrl, rejectionReason: null }
        : { status: 'pending photo review', photoUrl };
      await updateDoc(doc(db, 'tasks', photoTask.id), update);
      toast.success(t('taskDone'));
      setPhotoTask(null);
      setIsRetake(false);
    } catch {
      toast.error('Failed to upload photo.');
    } finally {
      setModalLoading(false);
    }
  }

  // ── Flag Problem handler ─────────────────────────────────────────────────
  async function submitFlag(note) {
    if (!flagTask) return;
    setModalLoading(true);
    try {
      await updateDoc(doc(db, 'tasks', flagTask.id), {
        status:   'flagged',
        flagNote: note,
      });
      toast.success(t('problemReported'));
      setFlagTask(null);
    } catch {
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

  const shiftTime = shift
    ? `${shift.startTime ?? ''} – ${shift.endTime ?? ''}`
    : null;

  return (
    <div className={`min-h-full ${th.pageBg}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`px-5 pt-10 pb-5 ${th.cardBg} border-b ${th.border}`}>
        <p className={`text-sm ${th.textSub} mb-0.5`}>{greeting}</p>
        <h1 className={`text-2xl font-bold ${th.text}`}>
          {userProfile?.name ?? '—'}
        </h1>
        <p className={`text-xs mt-1 ${th.textSub}`}>
          {t('today')}: {formatDate(new Date(), lang)}
        </p>
        {shiftTime && (
          <p className={`text-xs mt-0.5 ${th.textSub}`}>
            🕐 {shiftTime}
          </p>
        )}
      </div>

      {/* ── Task list ──────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        <h2 className={`text-base font-semibold mb-3 ${th.text}`}>{t('todaysTasks')}</h2>

        {tasksLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : tasks.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <p className={`font-semibold ${th.text}`}>{t('noTasksToday')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                th={th}
                t={t}
                onMarkDone={handleMarkDone}
                onFlag={(task) => setFlagTask(task)}
                onRetakePhoto={handleRetakePhoto}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {confirmTask && (
        <ConfirmModal
          task={confirmTask}
          th={th}
          t={t}
          loading={modalLoading}
          onConfirm={confirmDone}
          onClose={() => !modalLoading && setConfirmTask(null)}
        />
      )}

      {photoTask && (
        <PhotoModal
          task={photoTask}
          th={th}
          t={t}
          loading={modalLoading}
          onSubmit={submitPhoto}
          onClose={() => { if (!modalLoading) { setPhotoTask(null); setIsRetake(false); } }}
        />
      )}

      {flagTask && (
        <FlagModal
          task={flagTask}
          th={th}
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
