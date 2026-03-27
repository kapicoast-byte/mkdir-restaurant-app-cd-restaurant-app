// Staff Check-In — check-in schedule and action (content built in next phase)
import { useStaffCtx } from '../../context/StaffContext';

export default function StaffCheckIn() {
  const { t, th } = useStaffCtx();

  return (
    <div className={`min-h-full ${th.pageBg}`}>
      {/* Header */}
      <div className={`px-5 pt-10 pb-6 ${th.cardBg} border-b ${th.border}`}>
        <h1 className={`text-2xl font-bold ${th.text}`}>{t('checkIn')}</h1>
      </div>

      {/* Placeholder body */}
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="text-6xl mb-4">📍</span>
        <p className={`text-lg font-semibold ${th.text}`}>Check-in coming soon</p>
        <p className={`text-sm mt-1 ${th.textSub}`}>
          Your daily check-in schedule will appear here.
        </p>
      </div>
    </div>
  );
}
