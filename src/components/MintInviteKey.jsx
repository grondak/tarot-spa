import { useRef, useState } from 'react';
import { adminMintInviteKey } from '../utils/inviteKeys';

export default function MintInviteKey({ mintFn = adminMintInviteKey }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);

  async function handleMint() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      setCode(await mintFn());
      setCopied(false);
    } catch {
      setError("We couldn't mint an Invite Key. Please try again.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setError('');
    } catch {
      setCopied(false);
      setError('Copy failed. Select the key and copy it manually.');
    }
  }

  return (
    <section aria-label="Invite Key minting" className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={handleMint}
        className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Minting…' : 'Mint Key'}
      </button>

      {code && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <code
            tabIndex="0"
            aria-label="Invite Key code"
            className="select-all rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-300"
          >
            {code}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg bg-gray-800 px-3 py-2 text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Invite Key copied' : ''}
          </span>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
