import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_DECK } from '../data/systemsTarot';
import { SPREADS } from '../utils/deck';
import OrientationGuideResults from './OrientationGuideResults';

const TIMEOUT_NOTE = 'The news is slow today — this Guide worked from the cards and your own words alone.';

let onRedrawFresh;
let onRedrawTweak;
let result;

beforeEach(() => {
  onRedrawFresh = vi.fn();
  onRedrawTweak = vi.fn();
  result = {
    spreadKey: 'decision',
    cards: [
      {
        name: FULL_DECK[0].name,
        position: SPREADS.decision.positions[0],
        inverted: false,
      },
      {
        name: FULL_DECK[1].name,
        position: SPREADS.decision.positions[1],
        inverted: true,
      },
    ],
    currentEvents: [
      {
        title: 'A consequential event',
        content: 'The event changes the surrounding system.',
      },
    ],
    guide: 'First paragraph of the guide.\n\nSecond paragraph of the guide.',
    tavilyTimedOut: false,
  };
});

function renderResults(overrides = {}) {
  return render(
    <OrientationGuideResults
      result={{ ...result, ...overrides }}
      onRedrawFresh={onRedrawFresh}
      onRedrawTweak={onRedrawTweak}
    />,
  );
}

describe('OrientationGuideResults', () => {
  it('renders the role-scoped title, derived spread subtitle, and rehydrated cards', () => {
    renderResults();

    expect(
      screen.getByRole('heading', { name: 'Your Orientation Guide', level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByText(`${SPREADS.decision.label} · ${SPREADS.decision.description}`),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Your Draw', level: 2 })).toBeVisible();
    expect(screen.getByText(FULL_DECK[0].pattern)).toBeVisible();
    expect(screen.getByText(SPREADS.decision.positions[0])).toBeVisible();

    const invertedPattern = screen.getByText(FULL_DECK[1].invertedPattern);
    expect(invertedPattern).toHaveClass('text-amber-300/90', 'border-amber-500');
    expect(
      screen.getByRole('heading', { name: `${FULL_DECK[1].name}, Inverted.`, level: 2 }),
    ).toBeVisible();
  });

  it('renders Current Events titles and content without inventing link UI', () => {
    renderResults();

    expect(screen.getByRole('heading', { name: 'Current Events', level: 2 })).toBeVisible();
    expect(screen.getByText('A consequential event')).toBeVisible();
    expect(screen.getByText('The event changes the surrounding system.')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the playful timeout note instead of the events list', () => {
    renderResults({ tavilyTimedOut: true });

    expect(screen.getByRole('heading', { name: 'Current Events', level: 2 })).toBeVisible();
    expect(screen.getByText(TIMEOUT_NOTE)).toBeVisible();
    expect(screen.queryByText('A consequential event')).not.toBeInTheDocument();
  });

  it('omits the entire Current Events block when there are no items and no timeout', () => {
    renderResults({ currentEvents: [] });

    expect(
      screen.queryByRole('heading', { name: 'Current Events', level: 2 }),
    ).not.toBeInTheDocument();
  });

  it('splits the essay on blank lines and applies body-essay typography to every paragraph', () => {
    renderResults();

    expect(
      screen.getByRole('heading', { name: 'Your Orientation Guide', level: 2 }),
    ).toBeVisible();
    const paragraphs = [
      screen.getByText('First paragraph of the guide.'),
      screen.getByText('Second paragraph of the guide.'),
    ];
    for (const paragraph of paragraphs) {
      expect(paragraph).toHaveClass('text-lg', 'leading-8', 'text-gray-200', 'mt-5', 'first:mt-0');
    }
    expect(paragraphs[0].closest('section')).toHaveClass('mx-auto', 'w-full', 'max-w-2xl');
  });

  it('has exactly one aria-hidden ornamental divider above both redraw actions', () => {
    renderResults();

    const glyphs = screen.getAllByText('❦');
    expect(glyphs).toHaveLength(1);
    const divider = glyphs[0].closest('[aria-hidden="true"]');
    const freshButton = screen.getByRole('button', { name: 'Provide another observation' });
    const tweakButton = screen.getByRole('button', { name: 'Tweak existing observation' });
    expect(divider).not.toBeNull();
    expect(divider.compareDocumentPosition(freshButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(divider.compareDocumentPosition(tweakButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(freshButton.compareDocumentPosition(tweakButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(freshButton).toBeVisible();
    expect(tweakButton).toBeVisible();
  });

  it('calls only onRedrawFresh for another observation and adds no sharing affordance', () => {
    renderResults();

    fireEvent.click(screen.getByRole('button', { name: 'Provide another observation' }));
    expect(onRedrawFresh).toHaveBeenCalledTimes(1);
    expect(onRedrawTweak).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /copy|share/i })).not.toBeInTheDocument();
  });

  it('calls only onRedrawTweak for the existing observation', () => {
    renderResults();

    fireEvent.click(screen.getByRole('button', { name: 'Tweak existing observation' }));
    expect(onRedrawTweak).toHaveBeenCalledTimes(1);
    expect(onRedrawFresh).not.toHaveBeenCalled();
  });
});
