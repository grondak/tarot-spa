import { useEffect, useRef, useState } from 'react';
import { sourceKey } from '../utils/observation/keys';
import { groupState, toggleFeed, toggleGroup } from '../utils/observation/sources';
import { suggestSource } from '../utils/observation/suggest';

const buttonClass = 'rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-sm text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40';

function GroupCheckbox({ group, state, onToggle }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'partial';
  }, [state]);
  return (
    <label className="flex items-center gap-2 font-semibold text-white">
      <input ref={ref} type="checkbox" checked={state !== 'off'} onChange={onToggle} aria-label={`${group.name} (whole group)`} />
      {group.name}
    </label>
  );
}

function SuggestSource({ suggestFn }) {
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState('idle');

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      await suggestFn(text.trim(), contact.trim());
      setText('');
      setContact('');
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <form onSubmit={send} className="mt-4 space-y-2 border-t border-gray-800 pt-3">
      <p className="font-semibold text-white">Suggest a source</p>
      <p className="text-gray-400">
        Tell me a topic or paste a feed address. I read every suggestion and add the ones that fit.
        It’s sent to me as a message and not saved in the app.
      </p>
      <label className="block text-gray-300">
        Your suggestion
        <textarea
          value={text}
          maxLength={1000}
          rows={2}
          onChange={(e) => { setText(e.target.value); setStatus('idle'); }}
          className="mt-1 w-full rounded-md border border-gray-800 bg-gray-950 px-2.5 py-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
      </label>
      <label className="block text-gray-300">
        How to reach you (optional)
        <input
          value={contact}
          maxLength={200}
          onChange={(e) => setContact(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-800 bg-gray-950 px-2.5 py-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={!text.trim() || status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send suggestion'}
        </button>
        {status === 'sent' && <span role="status" className="text-gray-400">Sent. Thank you.</span>}
        {status === 'failed' && <span role="alert" className="text-red-400">It didn’t send. Try again in a moment.</span>}
      </div>
    </form>
  );
}

export default function ObservationSources({
  catalog, disabled, onChange, suggestFn = suggestSource,
}) {
  const total = catalog.reduce((n, g) => n + (g.injected ? 1 : g.feeds.length), 0);
  const on = catalog.reduce((n, g) => {
    if (g.injected) return n + (disabled.has(sourceKey.group(g.name)) ? 0 : 1);
    return n + g.feeds.filter((f) => groupState({ ...g, feeds: [f] }, disabled) === 'on').length;
  }, 0);

  return (
    <details className="mt-3 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm" data-testid="sources">
      <summary className="cursor-pointer text-gray-300">
        Sources and suggestions ({on} of {total} on)
      </summary>
      <div className="mt-3 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {catalog.map((group) => (
          <fieldset key={group.name} className="space-y-1">
            <legend className="sr-only">{group.name}</legend>
            <GroupCheckbox
              group={group}
              state={groupState(group, disabled)}
              onToggle={() => onChange(toggleGroup(catalog, disabled, group.name))}
            />
            {group.injected && (
              <p className="pl-6 text-gray-400">One item a day from outside your interests.</p>
            )}
            {group.feeds.map((feed) => (
              <label key={feed.id} className="flex items-center gap-2 pl-6 text-gray-300">
                <input
                  type="checkbox"
                  checked={groupState({ ...group, feeds: [feed] }, disabled) === 'on'}
                  onChange={() => onChange(toggleFeed(catalog, disabled, group.name, feed.id))}
                />
                {feed.name}{feed.retired ? ' (retired)' : ''}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {disabled.size > 0 && (
        <button type="button" className={`mt-3 ${buttonClass}`} onClick={() => onChange(new Set())}>
          Switch every source back on
        </button>
      )}
      <SuggestSource suggestFn={suggestFn} />
    </details>
  );
}
