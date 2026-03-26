// Generic loading spinner for data fetch states
export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
