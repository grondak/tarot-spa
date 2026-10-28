import { useState } from 'react';
import { SPREADS } from '../utils/deck';
import { deleteSavedReading, loadSavedReadings } from '../utils/savedReadings';
import OrientationGuideResults from './OrientationGuideResults';

function formatSavedAt(savedAt) {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function SavedReadings({ userId, onBack }) {
  const [readings, setReadings] = useState(() => loadSavedReadings(userId));
  const [openId, setOpenId] = useState(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const open = readings.find((reading) => reading.id === openId);

  function handleDelete(id) {
    const deleted = deleteSavedReading(userId, id);
    setDeleteFailed(!deleted);
    if (deleted) {
      setReadings((current) => current.filter((reading) => reading.id !== id));
      setOpenId(null);
    }
  }

  if (open) {
    return (
      <>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-6 print:hidden">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Back to saved readings
          </button>
          <button
            type="button"
            onClick={() => handleDelete(open.id)}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-red-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Delete this reading
          </button>
        </div>
        {deleteFailed && (
          <p role="alert" className="mx-auto mt-2 max-w-6xl px-4 text-sm text-red-400">
            This reading couldn’t be deleted — your browser may be blocking storage.
          </p>
        )}
        <OrientationGuideResults result={open} showRedraw={false} />
      </>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Back
        </button>
        <h1 className="mt-6 text-2xl font-bold">Saved readings</h1>
        <p className="mt-1 text-sm text-gray-400">
          Stored only in this browser. Clearing your browser data removes them.
        </p>
        {readings.length === 0 ? (
          <p className="mt-8 text-gray-400">
            Nothing saved yet. Use “Save to this device” on a finished Orientation Guide.
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {readings.map((reading) => (
              <li key={reading.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(reading.id)}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-left hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="block text-xs uppercase tracking-widest text-gray-400">
                    {SPREADS[reading.spreadKey]?.label ?? 'Reading'} · {formatSavedAt(reading.savedAt)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-gray-200">
                    {reading.context || 'No question recorded'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
