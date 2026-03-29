// Manager dashboard — greeting, stats, quick actions, live feed, missed check-in alert
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  return new Date(val);
}

function timeAgo(date) {
  if (!date) return '';
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

const AVATAR_BG = {
  owner: '#F97316', trustedManager: '#8B5CF6', manager: '#3B82F6',
  staff: '#6B7280', kitchen: '#22C55E', floor: '#F59E0B', cleaning: '#94A3B8',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, borderColor, valueColor }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeftWidth: '4px',
        borderLeftColor: borderColor ?? 'var(--color-primary)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div className="text-3xl font-bold" style={{ color: valueColor ?? 'var(--text)' }}>
        {value}
      </div>
      <div className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>{label}</div>
    </div>
  );
}

// ── Activity avatar ───────────────────────────────────────────────────────────
function ActivityAvatar({ name, role }) {
  const initials = getInitials(name);
  const bg = AVATAR_BG[role] ?? AVATAR_BG.staff;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { user, userProfile, branchId } = useAuth();
  const navigate = useNavigate();
  const [tasks,       setTasks]       = useState([]);
  const [staff,       setStaff]       = useState([]);
  const [checkIns,    setCheckIns]    = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [branchName,  setBranchName]  = useState('');
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!branchId) return;

    // Fetch branch name
    getDoc(doc(db, 'branches', branchId)).then((snap) => {
      if (snap.exists()) setBranchName(snap.data().name ?? '');
    }).catch(() => {});

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId)),
      (snap) => { setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId), where('isActive', '==', true)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubCheckIns = onSnapshot(
      query(collection(db, 'checkIns'), where('branchId', '==', branchId)),
      (snap) => setCheckIns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    // Recent activity: last 10 tasks by createdAt
    const unsubRecent = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => setRecentTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubTasks(); unsubStaff(); unsubCheckIns(); unsubRecent(); };
  }, [branchId]);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  const now      = new Date();
  const todayStr = now.toDateString();
  const firstName = userProfile?.name?.split(' ')[0] ?? 'Manager';

  // Stats
  const todayTasks     = tasks.filter((t) => t.dueTime && new Date(t.dueTime).toDateString() === todayStr);
  const totalToday     = todayTasks.length;
  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const pendingToday   = todayTasks.filter((t) => ['pending', 'in progress'].includes(t.status)).length;
  const overdueToday   = todayTasks.filter((t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < now).length;

  // Missed check-ins today
  const todayCheckIns = checkIns.filter((c) => {
    const ts = toDate(c.timestamp);
    return ts && ts.toDateString() === todayStr;
  });
  const missedCount = todayCheckIns.filter((c) => c.status === 'missed').length;

  // Pending photo review count
  const pendingPhotos = tasks.filter((t) => t.status === 'pending photo review').length;

  // Build activity feed from recentTasks + today's checkIns
  const taskActivity = recentTasks.map((t) => {
    const ts    = toDate(t.createdAt);
    const sName = staff.find((s) => s.id === (t.assignedToStaffId ?? t.assignedTo))?.name
               ?? staff.find((s) => s.authUid === t.assignedTo)?.name ?? 'Staff';
    const sRole = staff.find((s) => s.id === (t.assignedToStaffId ?? t.assignedTo))?.role
               ?? staff.find((s) => s.authUid === t.assignedTo)?.role ?? 'staff';
    let icon = '📋', desc = `${sName} was assigned "${t.title}"`;
    if (t.status === 'completed')             { icon = '✅'; desc = `${sName} completed "${t.title}"`; }
    else if (t.status === 'flagged')          { icon = '🚩'; desc = `${sName} flagged "${t.title}"`; }
    else if (t.status === 'pending photo review') { icon = '📷'; desc = `${sName} submitted photo for "${t.title}"`; }
    return { id: `task-${t.id}`, ts, icon, desc, name: sName, role: sRole };
  });

  const checkInActivity = todayCheckIns.slice(0, 5).map((c) => {
    const ts   = toDate(c.timestamp);
    const s    = staff.find((st) => st.id === c.staffId);
    const desc = c.status === 'missed'
      ? `${s?.name ?? 'Staff'} missed check-in`
      : `${s?.name ?? 'Staff'} checked in`;
    return { id: `ci-${c.id}`, ts, icon: c.status === 'missed' ? '❌' : '📍', desc, name: s?.name ?? '', role: s?.role ?? 'staff' };
  });

  const feed = [...taskActivity, ...checkInActivity]
    .filter((a) => a.ts)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12);

  return (
    <div className="space-y-6">

      {/* ── Missed check-ins alert ───────────────────────────────────────── */}
      {missedCount > 0 && (
        <button
          onClick={() => navigate('/manager/checkins')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <span className="text-lg">⚠️</span>
          <span className="text-sm font-semibold" style={{ color: '#DC2626' }}>
            {missedCount} staff member{missedCount > 1 ? 's' : ''} missed their check-in today
          </span>
          <span className="ml-auto text-xs" style={{ color: '#EF4444' }}>View →</span>
        </button>
      )}

      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {getGreeting()}, {firstName} 👋
          </h2>
          {branchName && (
            <span
              className="px-3 py-1 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {branchName}
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>{formatDate()}</p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tasks Today"  value={totalToday}     borderColor="var(--color-primary)" />
        <StatCard label="Completed"    value={completedToday} borderColor="#22C55E" valueColor="#16A34A" />
        <StatCard label="Pending"      value={pendingToday}   borderColor="#EAB308" valueColor="#CA8A04" />
        <StatCard
          label="Overdue"
          value={overdueToday}
          borderColor={overdueToday > 0 ? '#EF4444' : 'var(--border2)'}
          valueColor={overdueToday > 0 ? '#DC2626' : 'var(--text-faint)'}
        />
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/manager/tasks')}
          className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + Create Task
        </button>
        <button
          onClick={() => navigate('/manager/shifts')}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors"
          style={{ color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', backgroundColor: 'transparent' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-faint)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          + Add Shift
        </button>
        <button
          onClick={() => navigate('/manager/photos')}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          style={{ color: 'var(--text-sub)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
        >
          Review Photos
          {pendingPhotos > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: '#8B5CF6' }}
            >
              {pendingPhotos}
            </span>
          )}
        </button>
      </div>

      {/* ── Live activity feed ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Live Activity
          </h3>
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: '#22C55E' }}
          />
        </div>

        {feed.length === 0 ? (
          <div
            className="rounded-xl px-5 py-10 text-center"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-2xl mb-2">🕐</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-sub)' }}>
              No activity yet today
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden divide-y"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
              '--tw-divide-color': 'var(--border)',
            }}
          >
            {feed.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <ActivityAvatar name={item.name} role={item.role} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text)' }}>
                    <span className="mr-1.5">{item.icon}</span>
                    {item.desc}
                  </p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                  {timeAgo(item.ts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
