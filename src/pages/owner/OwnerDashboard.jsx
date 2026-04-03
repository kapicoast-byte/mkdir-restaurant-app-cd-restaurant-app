// Owner dashboard — greeting, stat cards, branch health grid, photo audit
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeHealthScore(tasks) {
  const todayStr = new Date().toDateString();
  const todayTasks = tasks.filter((t) => {
    if (!t.dueTime) return false;
    return new Date(t.dueTime).toDateString() === todayStr;
  });
  if (!todayTasks.length) return null;
  const completed = todayTasks.filter((t) => t.status === 'completed').length;
  return Math.round((completed / todayTasks.length) * 100);
}

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

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid var(--color-primary)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        className="text-3xl font-bold"
        style={{ color: accent ? 'var(--color-primary)' : 'var(--text)' }}
      >
        {value}
      </div>
      <div className="text-sm mt-1 font-medium" style={{ color: 'var(--text-sub)' }}>
        {label}
      </div>
      {sub !== undefined && (
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Health bar ───────────────────────────────────────────────────────────────
function HealthBar({ score }) {
  if (score === null) {
    return <span className="text-xs" style={{ color: 'var(--text-faint)' }}>No tasks today</span>;
  }
  const color = score >= 75 ? '#22C55E' : score >= 40 ? '#EAB308' : '#EF4444';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>Health</span>
        <span className="text-xs font-bold" style={{ color }}>{score}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Photo lightbox ───────────────────────────────────────────────────────────
function PhotoLightbox({ url, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl leading-none"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={url}
        alt="Task photo"
        className="max-w-full max-h-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const { user, userProfile } = useAuth();
  const [branches,    setBranches]    = useState([]);
  const [allStaff,    setAllStaff]    = useState([]);
  const [allTasks,    setAllTasks]    = useState([]);
  const [allTrips,    setAllTrips]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [auditBranch, setAuditBranch] = useState('all');
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    if (!user) return;

    const unsubBranches = onSnapshot(
      query(collection(db, 'branches'), where('ownerId', '==', user.uid)),
      (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('isActive', '==', true)),
      (snap) => setAllStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        setAllTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    const unsubTrips = onSnapshot(
      query(collection(db, 'trips'), orderBy('createdAt', 'desc')),
      (snap) => setAllTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubBranches(); unsubStaff(); unsubTasks(); unsubTrips(); };
  }, [user]);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  const now        = new Date();
  const todayStr   = now.toDateString();
  const ownerName  = userProfile?.name?.split(' ')[0] ?? 'Owner';

  // Stat calculations
  const completedToday = allTasks.filter((t) => {
    if (t.status !== 'completed') return false;
    const d = toDate(t.updatedAt);
    return d && d.toDateString() === todayStr;
  }).length;

  const overdueTasks = allTasks.filter(
    (t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < now
  ).length;

  // Per-branch stats
  const branchStats = branches.map((branch) => {
    const branchStaff  = allStaff.filter((s) => s.branchId === branch.id);
    const branchTasks  = allTasks.filter((t) => t.branchId === branch.id);
    const activeTasks  = branchTasks.filter((t) => t.status !== 'completed').length;
    const overdueCount = branchTasks.filter(
      (t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < now
    ).length;
    const health = computeHealthScore(branchTasks);
    return { branch, staffCount: branchStaff.length, activeTasks, overdueCount, health };
  });

  // Photo audit
  const photoAuditTasks = allTasks
    .filter((t) => t.status === 'completed' && t.photoUrl)
    .filter((t) => auditBranch === 'all' || t.branchId === auditBranch)
    .sort((a, b) => {
      const ta = toDate(a.updatedAt) ?? new Date(0);
      const tb = toDate(b.updatedAt) ?? new Date(0);
      return tb - ta;
    });

  const staffName  = (id) => allStaff.find((s) => s.id === id)?.name ?? '—';
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <div className="space-y-8">

      {/* ── Greeting ───────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {getGreeting()}, {ownerName} 👋
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
          {formatDate()}
        </p>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Branches"        value={branches.length}     />
        <StatCard label="Active Staff"          value={allStaff.length}     />
        <StatCard label="Tasks Completed Today" value={completedToday}       accent />
        <Link to="/owner/trips" style={{ textDecoration: 'none' }}>
          <StatCard
            label="Active Trips"
            value={allTrips.filter((t) => t.status === 'in_progress').length}
            sub={`${allTrips.filter((t) => t.status === 'pending').length} pending`}
            accent
          />
        </Link>
      </div>

      {/* ── Branches section ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Branches
          </h3>
          <Link
            to="/owner/branches"
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-dark)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-primary)'}
          >
            View All →
          </Link>
        </div>

        {branches.length === 0 ? (
          <EmptyState
            icon="🏢"
            title="No branches yet"
            message="Go to Branches to add your first restaurant branch."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branchStats.map(({ branch, staffCount, activeTasks, overdueCount, health }) => (
              <div
                key={branch.id}
                className="rounded-xl p-5"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                {/* Branch header */}
                <div className="mb-4">
                  <h4 className="font-semibold" style={{ color: 'var(--text)' }}>
                    {branch.name}
                  </h4>
                  {branch.location && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {branch.location}
                    </p>
                  )}
                </div>

                {/* Health bar */}
                <div className="mb-4">
                  <HealthBar score={health} />
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="text-center">
                    <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{staffCount}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Staff</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold" style={{ color: '#3B82F6' }}>{activeTasks}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Active</div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-lg font-bold"
                      style={{ color: overdueCount > 0 ? '#EF4444' : 'var(--text-faint)' }}
                    >
                      {overdueCount}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Overdue</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Photo Audit ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Photo Audit
          </h3>
          <select
            value={auditBranch}
            onChange={(e) => setAuditBranch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {photoAuditTasks.length === 0 ? (
          <EmptyState icon="🖼️" title="No photo completions yet" message="Completed tasks with photos will appear here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {photoAuditTasks.map((task) => {
              const completedAt = toDate(task.updatedAt);
              return (
                <div
                  key={task.id}
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
                >
                  <button
                    onClick={() => setLightboxUrl(task.photoUrl)}
                    className="w-full h-40 overflow-hidden block"
                    style={{ backgroundColor: 'var(--surface2)' }}
                  >
                    <img
                      src={task.photoUrl}
                      alt="Task proof"
                      className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <div className="p-4">
                    <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                      {task.title}
                    </h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs" style={{ color: 'var(--text-sub)' }}>
                      <span>👤 {staffName(task.assignedTo)}</span>
                      <span>🏢 {branchName(task.branchId)}</span>
                      {completedAt && (
                        <span>
                          {completedAt.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
