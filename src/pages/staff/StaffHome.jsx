// Staff Home — task list (content built in next phase)
import { useStaffCtx } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';

export default function StaffHome() {
  const { t, th } = useStaffCtx();
  const { userProfile } = useAuth();

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('goodMorning') :
    hour < 17 ? t('goodAfternoon') :
                t('goodEvening');

  return (
    <div className={`min-h-full ${th.pageBg}`}>
      {/* Header */}
      <div className={`px-5 pt-10 pb-6 ${th.cardBg} border-b ${th.border}`}>
        <p className={`text-sm ${th.textSub} mb-1`}>{greeting}</p>
        <h1 className={`text-2xl font-bold ${th.text}`}>
          {userProfile?.name ?? '—'}
        </h1>
      </div>

      {/* Placeholder body */}
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="text-6xl mb-4">🚧</span>
        <p className={`text-lg font-semibold ${th.text}`}>Tasks coming soon</p>
        <p className={`text-sm mt-1 ${th.textSub}`}>
          This page will show your task list.
        </p>
      </div>
    </div>
  );
}
