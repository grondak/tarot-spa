import { useEffect, useState } from 'react';
import { getAdminMetrics } from '../utils/adminMetrics';

const buttonClass = 'rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export default function AdminDashboard({
  getAdminMetricsFn = getAdminMetrics,
  onBack = () => {},
}) {
  const [loadStatus, setLoadStatus] = useState('loading');
  const [metrics, setMetrics] = useState(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;

    getAdminMetricsFn()
      .then((result) => {
        if (!active) return;
        setMetrics(result);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (active) setLoadStatus('error');
      });

    return () => {
      active = false;
    };
  }, [getAdminMetricsFn, requestId]);

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
        <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
          Back
        </button>
      </div>
    </main>
  );
}
