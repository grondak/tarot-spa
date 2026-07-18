export default function OrnamentalDivider() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3.5">
      <div className="h-px flex-1 bg-gray-700" />
      <span className="text-lg leading-none text-gray-400">❦</span>
      <div className="h-px flex-1 bg-gray-700" />
    </div>
  );
}
