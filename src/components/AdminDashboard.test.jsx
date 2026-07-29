import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';

const metrics = {
  generatedAt: '2026-07-26T18:04:00.000Z',
  usersByGeneration: { FirstGen: 3, SecondGen: 2 },
  succeededSessionCount: 42,
  dailyLimitHitRate: 0.15,
  dailyUsageRecordCount: 40,
  monthlySpend: { spentToDate: 4.32, budget: 30 },
  averageGroundednessScore: 0.28,
  scoredSessionCount: 38,
};

describe('AdminDashboard', () => {
  it('renders an announced loading state', () => {
    render(<AdminDashboard getAdminMetricsFn={() => new Promise(() => {})} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading metrics');
  });

  it('keeps Back navigation available while metrics are loading', () => {
    const onBack = vi.fn();
    render(
      <AdminDashboard
        getAdminMetricsFn={() => new Promise(() => {})}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders a retryable error and re-fetches successfully', async () => {
    const getAdminMetricsFn = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(metrics);
    render(<AdminDashboard getAdminMetricsFn={getAdminMetricsFn} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Metrics couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
    expect(getAdminMetricsFn).toHaveBeenCalledTimes(2);
  });

  it('renders every metric, the score clarifier, and the refresh timestamp', async () => {
    render(<AdminDashboard getAdminMetricsFn={() => Promise.resolve(metrics)} />);

    expect(await screen.findByText('FirstGen: 3, SecondGen: 2')).toBeVisible();
    expect(screen.getByText('42')).toBeVisible();
    expect(screen.getByText('15.0% (40 daily usage records)')).toBeVisible();
    expect(screen.getByText('$4.32 of $30.00 budget')).toBeVisible();
    expect(screen.getByText(
      '0.28 — lower is better (0 = fully grounded, 1 = fully abstract) (38 scored Sessions)',
    )).toBeVisible();
    expect(screen.getByText(new Date(metrics.generatedAt).toLocaleString())).toBeVisible();
  });

  it('distinguishes missing rate and score data from numeric zero', async () => {
    render(
      <AdminDashboard
        getAdminMetricsFn={() => Promise.resolve({
          ...metrics,
          dailyLimitHitRate: null,
          dailyUsageRecordCount: 0,
          averageGroundednessScore: null,
          scoredSessionCount: 0,
        })}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getAllByText('No data yet')).toHaveLength(2);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('calls onBack exactly once', async () => {
    const onBack = vi.fn();
    render(
      <AdminDashboard
        getAdminMetricsFn={() => Promise.resolve(metrics)}
        onBack={onBack}
      />,
    );

    await screen.findByRole('heading', { name: 'Admin Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
