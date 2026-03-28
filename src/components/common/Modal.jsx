// Reusable modal — uses CSS variables so it respects light/dark theme
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;

  const maxWidths = { sm: '400px', md: '560px', lg: '720px', xl: '960px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="relative w-full mx-4 z-10 flex flex-col"
        style={{
          maxWidth:        maxWidths[size] ?? maxWidths.md,
          maxHeight:       '90vh',
          backgroundColor: 'var(--surface)',
          border:          '1px solid var(--border)',
          borderRadius:    '16px',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-sub)' }}
          >
            ×
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}
