import { useEffect, useRef, useState } from 'react';
import { checkInviteKey, revokeInviteKey } from '../utils/inviteKeys';

const STATUS_MESSAGES = {
  unredeemed: 'This key is unredeemed — ready to revoke.',
  redeemed: "This key has already been redeemed — it can't be revoked.",
  revoked: 'This key has already been revoked.',
};
const NOT_FOUND_MESSAGE = 'No Invite Key found with that code.';
const BLANK_CODE_MESSAGE = 'Enter an Invite Key code first.';
const CHECK_FAILED_MESSAGE = "Couldn't check this key. Please try again.";
const REVOKE_SUCCESS_MESSAGE = 'Invite Key revoked.';
const REVOKE_GENERIC_ERROR_MESSAGE = "Couldn't revoke this key. Please try again.";
const REVOKE_ERROR_MESSAGES = {
  INVITE_KEY_NOT_FOUND: NOT_FOUND_MESSAGE,
  INVITE_KEY_ALREADY_REDEEMED: STATUS_MESSAGES.redeemed,
  INVITE_KEY_ALREADY_REVOKED: STATUS_MESSAGES.revoked,
};

function lookupMessage(status) {
  return status === null ? NOT_FOUND_MESSAGE : STATUS_MESSAGES[status];
}

const inputClass = 'mt-1 w-64 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-60';
const buttonClass = 'rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60';

export default function RevokeInviteKey({
  checkInviteKeyFn = checkInviteKey,
  revokeInviteKeyFn = revokeInviteKey,
}) {
  const [code, setCode] = useState('');
  const [lookedUpCode, setLookedUpCode] = useState('');
  // `undefined` = no lookup result to display yet (distinct from `null`, a real "not found").
  const [lookupStatus, setLookupStatus] = useState();
  const [checkBusy, setCheckBusy] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [revokeError, setRevokeError] = useState('');
  const [revokeSuccess, setRevokeSuccess] = useState('');
  const checkSubmitting = useRef(false);
  const revokeSubmitting = useRef(false);
  // Initializing to `true` and only clearing it on cleanup looks unmount-safe, but
  // React 18 StrictMode's dev-only mount→cleanup→remount dance runs the cleanup
  // before this component is ever interacted with, leaving the ref stuck `false`
  // for the component's entire real lifetime — every post-await guard below would
  // then bail out forever, hanging the busy state. Setting it in the effect body
  // itself (not just the initializer) survives that double-invoke correctly.
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleCheck() {
    if (checkSubmitting.current) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setCheckError(BLANK_CODE_MESSAGE);
      return;
    }

    checkSubmitting.current = true;
    setCheckBusy(true);
    setCheckError('');
    setRevokeError('');
    setRevokeSuccess('');

    try {
      const status = await checkInviteKeyFn(trimmed);
      if (!mounted.current) return;
      setLookedUpCode(trimmed);
      setLookupStatus(status);
    } catch {
      if (!mounted.current) return;
      setCheckError(CHECK_FAILED_MESSAGE);
      setLookupStatus(undefined);
    } finally {
      checkSubmitting.current = false;
      if (mounted.current) setCheckBusy(false);
    }
  }

  async function handleRevoke() {
    if (revokeSubmitting.current) return;
    if (lookupStatus !== 'unredeemed') return;

    revokeSubmitting.current = true;
    setRevokeBusy(true);
    setRevokeError('');
    setRevokeSuccess('');

    try {
      await revokeInviteKeyFn(lookedUpCode);
      if (!mounted.current) return;
      setLookupStatus('revoked');
      setRevokeSuccess(REVOKE_SUCCESS_MESSAGE);
    } catch (error) {
      if (!mounted.current) return;
      setRevokeError(REVOKE_ERROR_MESSAGES[error.message] ?? REVOKE_GENERIC_ERROR_MESSAGE);
    } finally {
      revokeSubmitting.current = false;
      if (mounted.current) setRevokeBusy(false);
    }
  }

  const busy = checkBusy || revokeBusy;

  return (
    <section aria-labelledby="revoke-invite-key-heading" className="mt-6">
      <h2 id="revoke-invite-key-heading" className="text-sm font-semibold text-gray-300">
        Revoke Invite Key
      </h2>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="revoke-invite-key-code" className="block text-sm text-gray-300">
            Invite Key code
          </label>
          <input
            id="revoke-invite-key-code"
            type="text"
            value={code}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
            className={inputClass}
          />
        </div>
        <button type="button" disabled={busy} onClick={handleCheck} className={buttonClass}>
          {checkBusy ? 'Checking…' : 'Check key'}
        </button>
        {lookupStatus === 'unredeemed' && (
          <button type="button" disabled={busy} onClick={handleRevoke} className={buttonClass}>
            {revokeBusy ? 'Revoking…' : 'Revoke key'}
          </button>
        )}
      </div>

      {checkError && <p role="alert" className="mt-2 text-sm text-red-400">{checkError}</p>}
      {lookupStatus !== undefined && (
        <p role="status" className="mt-2 text-sm text-gray-400">{lookupMessage(lookupStatus)}</p>
      )}
      {revokeSuccess && <p role="status" className="mt-2 text-sm text-gray-400">{revokeSuccess}</p>}
      {revokeError && <p role="alert" className="mt-2 text-sm text-red-400">{revokeError}</p>}
    </section>
  );
}
