import { useEffect, useState } from 'react';
import { getAdminLogs } from '../utils/adminLogs';
import { getAdminMetrics } from '../utils/adminMetrics';
import AdminConfigEditor from './AdminConfigEditor';
import MintInviteKey from './MintInviteKey';
import RevokeInviteKey from './RevokeInviteKey';

const buttonClass = 'rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

function formatEdt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDuration(durationMs) {
  if (typeof durationMs !== 'number') return '—';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function LogSection({ title, columns, rows, rowKey }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No entries yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                {columns.map((column) => (
                  <th key={column.key} className="py-2 pr-4 font-semibold">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900">
              {rows.map((row, index) => (
                <tr key={rowKey(row, index)}>
                  {columns.map((column) => (
                    <td key={column.key} className="py-2 pr-4 text-gray-300">
                      {column.render ? column.render(row) : (row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminDashboard({
  getAdminMetricsFn = getAdminMetrics,
  getAdminLogsFn = getAdminLogs,
  onBack = () => {},
}) {
  const [loadStatus, setLoadStatus] = useState('loading');
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([getAdminMetricsFn(), getAdminLogsFn()])
      .then(([metricsResult, logsResult]) => {
        if (!active) return;
        setMetrics(metricsResult);
        setLogs(logsResult);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (active) setLoadStatus('error');
      });

    return () => {
      active = false;
    };
  }, [getAdminMetricsFn, getAdminLogsFn, requestId]);

  if (loadStatus === 'loading') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-4xl">
          <p role="status" className="text-sm text-gray-400">
            Loading metrics…
          </p>
          <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
            Back
          </button>
        </div>
      </main>
    );
  }

  if (loadStatus === 'error') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <span role="alert" className="text-sm text-red-400">Metrics couldn’t load</span>
          <button
            type="button"
            onClick={() => {
              setLoadStatus('loading');
              setRequestId((value) => value + 1);
            }}
            className={buttonClass}
          >
            Retry
          </button>
          <button type="button" onClick={onBack} className={buttonClass}>
            Back
          </button>
        </div>
      </main>
    );
  }

  const hitRate = metrics.dailyLimitHitRate === null
    ? 'No data yet'
    : `${(metrics.dailyLimitHitRate * 100).toFixed(1)}% (${metrics.dailyUsageRecordCount} daily usage records)`;
  const averageGroundedness = metrics.averageGroundednessScore === null
    ? 'No data yet'
    : `${metrics.averageGroundednessScore.toFixed(2)} — lower is better (0 = fully grounded, 1 = fully abstract) (${metrics.scoredSessionCount} scored Sessions)`;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <MintInviteKey />
        <RevokeInviteKey />
        <AdminConfigEditor
          dailyLimit={metrics.config.dailyLimit}
          monthlyBudget={metrics.config.monthlyBudget}
          onSaved={(saved) => setMetrics((current) => ({
            ...current,
            config: saved,
            monthlySpend: { ...current.monthlySpend, budget: saved.monthlyBudget },
          }))}
        />
        <dl className="mt-8 divide-y divide-gray-800 border-y border-gray-800">
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Users by generation</dt>
            <dd className="mt-1 text-gray-400">
              FirstGen: {metrics.usersByGeneration.FirstGen}, SecondGen: {metrics.usersByGeneration.SecondGen}
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">SUCCEEDED Sessions</dt>
            <dd className="mt-1 text-gray-400">{metrics.succeededSessionCount}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Daily Orientation Limit hit-rate</dt>
            <dd className="mt-1 text-gray-400">{hitRate}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Spend to date</dt>
            <dd className="mt-1 text-gray-400">
              ${metrics.monthlySpend.spentToDate.toFixed(2)} of ${metrics.monthlySpend.budget.toFixed(2)} budget
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">
              Average groundedness (floater) score
            </dt>
            <dd className="mt-1 text-gray-400">{averageGroundedness}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Last refreshed</dt>
            <dd className="mt-1 text-gray-400">
              {new Date(metrics.generatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        <LogSection
          title="Minting Log"
          rows={logs.mintingLog}
          rowKey={(row) => row.code}
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'generation', label: 'Generation' },
            { key: 'status', label: 'Status' },
            { key: 'mintedByEmail', label: 'Minted by' },
            { key: 'createdAt', label: 'Created (EDT)', render: (row) => formatEdt(row.createdAt) },
          ]}
        />

        <LogSection
          title="Admin Action Log"
          rows={logs.adminActionLog}
          rowKey={(row, index) => `${row.code}-${row.action}-${index}`}
          columns={[
            { key: 'action', label: 'Action' },
            { key: 'code', label: 'Code' },
            { key: 'byEmail', label: 'By' },
            { key: 'at', label: 'When (EDT)', render: (row) => formatEdt(row.at) },
          ]}
        />

        <LogSection
          title="Signup Log"
          rows={logs.signupLog}
          rowKey={(row) => row.email ?? row.redeemedInviteKey}
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'redeemedInviteKey', label: 'Invite Key' },
            { key: 'generation', label: 'Generation' },
            { key: 'createdAt', label: 'Signed up (EDT)', render: (row) => formatEdt(row.createdAt) },
          ]}
        />

        <LogSection
          title="Questions Log"
          rows={logs.questionsLog}
          rowKey={(row, index) => `${row.ownerEmail}-${row.occurredAt}-${index}`}
          columns={[
            { key: 'ownerEmail', label: 'Who' },
            { key: 'occurredAt', label: 'When (EDT)', render: (row) => formatEdt(row.occurredAt) },
            { key: 'durationMs', label: 'Duration', render: (row) => formatDuration(row.durationMs) },
            { key: 'hadResult', label: 'Result', render: (row) => (row.hadResult ? 'Yes' : 'No') },
          ]}
        />

        <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
          Back
        </button>
      </div>
    </main>
  );
}
