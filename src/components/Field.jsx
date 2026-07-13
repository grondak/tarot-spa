export default function Field({ label, type = 'text', value, onChange, autoComplete }) {
  const id = label.toLowerCase().replaceAll(' ', '-');
  return (
    <div className="text-left">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-300">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
      />
    </div>
  );
}
