const APPS = [
  { key: 'orient', label: 'Orient', hint: 'Systems Thinking Tarot' },
  { key: 'observe', label: 'Observe', hint: 'Observation Window' },
];

// The site's two apps, side by side. Orient is the tarot; Observe is the Observation Window.
export default function AppSwitcher({ current = 'orient', onSelect = () => {} }) {
  return (
    <nav
      aria-label="Apps"
      className="print:hidden mx-auto flex w-full max-w-6xl gap-2 border-b border-gray-800 bg-gray-950 px-4 py-2"
    >
      {APPS.map(({ key, label, hint }) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="button"
            title={hint}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              active ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
