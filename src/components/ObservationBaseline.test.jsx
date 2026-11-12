import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ObservationBaseline from './ObservationBaseline';
import { HOUR } from '../utils/observation/timeline';
import { NOW, countRows, longRunRows, makeModel } from '../utils/observation/fixtures';

const DAY = 24 * HOUR;
const centre = NOW - DAY;
const viewOf = (allInWin) => ({ lo: centre - DAY / 2, hi: centre + DAY / 2, allInWin });
const bbcLane = (model) => model.feeds.findIndex((f) => f.name === 'BBC');

describe('ObservationBaseline', () => {
  it('says plainly when there is not enough history', () => {
    render(<ObservationBaseline model={makeModel()} view={viewOf([])} />);
    expect(screen.getByTestId('baseline-summary')).toHaveTextContent('Not enough history yet to say what is normal.');
    expect(screen.getByText(/at least 7 complete days of counts/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show lanes' })).toBeNull();
  });

  it('says every lane is about normal when nothing stands out', () => {
    render(<ObservationBaseline model={makeModel({ counts: countRows, runs: longRunRows })} view={viewOf([])} />);
    expect(screen.getByTestId('baseline-summary')).toHaveTextContent('Every lane is about normal for this window.');
  });

  it('names how many lanes are busier, and lists them first with their numbers', () => {
    const model = makeModel({ counts: countRows, runs: longRunRows });
    const busy = Array.from({ length: 7 }, () => ({ lane: bbcLane(model) }));
    render(<ObservationBaseline model={model} view={viewOf(busy)} />);

    expect(screen.getByTestId('baseline-summary')).toHaveTextContent('1 lane busier than normal');
    fireEvent.click(screen.getByRole('button', { name: 'Show lanes' }));
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('BBC')).toBeVisible();
    expect(rows[0]).toHaveTextContent('7 in this window · normal about 2 · busier than normal');
    expect(rows[1]).toHaveTextContent('about normal');
    expect(screen.getByTestId('volume-bbc')).toBeInTheDocument();
  });

  it('explains how normal was worked out and does not claim a cause', () => {
    render(<ObservationBaseline model={makeModel({ counts: countRows, runs: longRunRows })} view={viewOf([])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show lanes' }));
    expect(screen.getByText(/21 complete days of counts since 2026-10-10/)).toBeVisible();
    expect(screen.getByText(/shows a beat is active, not why/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hide lanes' }));
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
