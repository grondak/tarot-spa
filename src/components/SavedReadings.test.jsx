import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_DECK } from '../data/systemsTarot';
import { SPREADS } from '../utils/deck';
import { loadSavedReadings, saveReading } from '../utils/savedReadings';
import SavedReadings from './SavedReadings';

const reading = (sessionId, context) => ({
  sessionId,
  spreadKey: 'decision',
  context,
  cards: [{ name: FULL_DECK[0].name, position: SPREADS.decision.positions[0], inverted: false }],
  currentEvents: [],
  guide: `Guide for ${context}`,
  tavilyTimedOut: false,
});

beforeEach(() => {
  localStorage.clear();
});

describe('SavedReadings', () => {
  it('shows an empty state', () => {
    render(<SavedReadings userId="u1" onBack={() => {}} />);

    expect(screen.getByText(/Nothing saved yet/)).toBeVisible();
  });

  it("lists only this user's readings and opens one without redraw buttons", () => {
    saveReading('u1', reading('a', 'Take the Lisbon job?'));
    saveReading('u2', reading('b', 'Someone else’s question'));
    render(<SavedReadings userId="u1" onBack={() => {}} />);

    expect(screen.queryByText('Someone else’s question')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Take the Lisbon job\?/ }));

    expect(screen.getByRole('heading', { name: 'Your Question' })).toBeVisible();
    expect(screen.getByText('Guide for Take the Lisbon job?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Provide another observation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save to this device/ })).not.toBeInTheDocument();
  });

  it('deletes an opened reading from the list and from storage', () => {
    saveReading('u1', reading('a', 'First question'));
    saveReading('u1', reading('b', 'Second question'));
    render(<SavedReadings userId="u1" onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /First question/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete this reading' }));

    expect(screen.queryByText(/First question/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Second question/ })).toBeVisible();
    expect(loadSavedReadings('u1').map((r) => r.id)).toEqual(['b']);
  });

  it('calls onBack from the list', () => {
    const onBack = vi.fn();
    render(<SavedReadings userId="u1" onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
