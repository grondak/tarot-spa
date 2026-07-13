import { useRef, useState } from 'react';
import { mintOnwardKey } from '../utils/inviteKeys';
import { getMyAccount } from '../utils/account';

export default function GrantInviteKey({
  account,
  mintOnwardKeyFn = mintOnwardKey,
  refreshAccountFn = getMyAccount,
}) {
  const [currentAccount, setCurrentAccount] = useState(account);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);

  if (currentAccount?.generation !== 'FirstGen') return null;

  async function handleMint() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      setCode(await mintOnwardKeyFn());
    } catch (mintError) {
      const message = mintError instanceof Error ? mintError.message : String(mintError);
      if (message.includes('not eligible')) {
        try {
          const refreshedAccount = await refreshAccountFn();
          if (refreshedAccount?.onwardKeyGenerated) {
            setCurrentAccount(refreshedAccount);
          } else {
            setError('We couldn’t confirm your Invite Key status. Please try again.');
          }
        } catch {
          setError('We couldn’t refresh your account. Please try again.');
        }
      } else {
        setError('We couldn’t grant an Invite Key. Please try again.');
      }
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

  if (code) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
        <div className="text-right">
          <p className="mb-1 text-gray-300">Copy it now—it won’t be shown again.</p>
          <code
            tabIndex="0"
            aria-label="Invite Key code"
            className="select-all text-gray-300 text-xs font-mono bg-gray-800 px-2 py-0.5 rounded"
          >
            {code}
          </code>
        </div>
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
        {error && <p role="alert" className="w-full text-right text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (currentAccount.onwardKeyGenerated) {
    return <p className="text-sm text-gray-300">You&apos;ve already granted your key</p>;
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={busy}
        onClick={handleMint}
        className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Granting…' : 'Grant Invite Key'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
