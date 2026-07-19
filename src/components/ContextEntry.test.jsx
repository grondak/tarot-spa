import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextEntry from './ContextEntry';
import { SPREADS } from '../utils/deck';

const HINT = 'Tell me about your upcoming decision, and what you know or think you know about the situation.';
const RATE_LIMIT_NOTE = "You're tapped out on Orientation Guides for today — but the cards themselves are always free and unlimited. Draw away, no LLM, no limit. Your Orient-o-meter refills tomorrow.";
const LOADING_COPY = 'Reading the cards and the world...';
const GENERATION_ERROR = 'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.';
const MONTHLY_ERROR = "Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.";

let onOrient;
let onQuickDrawSelect;
let onLoadCode;

beforeEach(() => {
  onOrient = vi.fn();
  onQuickDrawSelect = vi.fn();
  onLoadCode = vi.fn();
});

function renderEntry(props = {}) {
  return render(
    <ContextEntry
      onOrient={onOrient}
      onQuickDrawSelect={onQuickDrawSelect}
      onLoadCode={onLoadCode}
      {...props}
    />,
  );
}

function orientButton() {
  return screen.getByRole('button', { name: 'Help Me Orient' });
}

function spreadButton(key) {
  return screen.getByRole('button', { name: new RegExp(SPREADS[key].label) });
}

describe('ContextEntry canonical state', () => {
  it('shows the title block, labeled Context field with the hint, and all four spreads', () => {
    renderEntry();

    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.getByText('Systems Thinking Tarot')).toBeVisible();
    const textarea = screen.getByLabelText('Context');
    expect(textarea).toBeVisible();
    expect(textarea).toHaveAttribute('placeholder', HINT);
    for (const spread of Object.values(SPREADS)) {
      expect(screen.getByText(spread.label)).toBeVisible();
    }
  });

  it('keeps the CTA inert while Context is blank', () => {
    renderEntry();

    expect(orientButton()).toBeDisabled();
  });

  it('keeps the CTA inert for whitespace-only Context even with a spread selected', () => {
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: '   \n  ' } });
    fireEvent.click(spreadButton('decision'));
    expect(orientButton()).toBeDisabled();
  });

  it('keeps the CTA inert with real text but no spread selected', () => {
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A real decision.' } });
    expect(orientButton()).toBeDisabled();
  });

  it('activates the CTA with real text and a spread, and submits trimmed context once', () => {
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: '  A real decision.  ' } });
    fireEvent.click(spreadButton('decision'));
    const cta = orientButton();
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(onOrient).toHaveBeenCalledTimes(1);
    expect(onOrient).toHaveBeenCalledWith('A real decision.', 'decision');
  });

  it('blocks a programmatic form submit while Context is whitespace-only', () => {
    const { container } = renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: '   ' } });
    fireEvent.click(spreadButton('decision'));
    fireEvent.submit(container.querySelector('form'));
    expect(onOrient).not.toHaveBeenCalled();
  });

  it('does not submit when picking a different spread with real text entered', () => {
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A real decision.' } });
    fireEvent.click(spreadButton('decision'));
    fireEvent.click(spreadButton('three'));
    expect(onOrient).not.toHaveBeenCalled();
  });

  it('marks the clicked spread as pressed', () => {
    renderEntry();

    fireEvent.click(spreadButton('decision'));
    expect(spreadButton('decision')).toHaveAttribute('aria-pressed', 'true');
    expect(spreadButton('single')).toHaveAttribute('aria-pressed', 'false');
  });

  it('brackets the screen with exactly two aria-hidden ornamental dividers', () => {
    renderEntry();

    const glyphs = screen.getAllByText('❦');
    expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) {
      expect(glyph.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('pre-fills the textarea from initialContext', () => {
    renderEntry({ initialContext: 'Seeded from a previous session.' });

    expect(screen.getByLabelText('Context')).toHaveValue('Seeded from a previous session.');
  });

  it('shows the loading treatment and blocks duplicate submits while pending', async () => {
    onOrient.mockImplementation(() => new Promise(() => {}));
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A real decision.' } });
    fireEvent.click(spreadButton('decision'));
    fireEvent.click(orientButton());
    fireEvent.click(orientButton());

    expect(await screen.findByRole('status')).toHaveTextContent(LOADING_COPY);
    expect(orientButton()).toBeDisabled();
    expect(onOrient).toHaveBeenCalledTimes(1);
  });

  it('shows the generation error while preserving Context and Spread for immediate retry', async () => {
    onOrient.mockRejectedValue(new Error('GENERATION_FAILED'));
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Keep this context.' } });
    fireEvent.click(spreadButton('decision'));
    fireEvent.click(orientButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERATION_ERROR);
    expect(screen.getByLabelText('Context')).toHaveValue('Keep this context.');
    expect(spreadButton('decision')).toHaveAttribute('aria-pressed', 'true');
    expect(orientButton()).toBeEnabled();
  });

  it('shows the monthly-budget message for its frozen code', async () => {
    onOrient.mockRejectedValue(new Error('wrapped MONTHLY_BUDGET_EXHAUSTED response'));
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Keep this context.' } });
    fireEvent.click(spreadButton('single'));
    fireEvent.click(orientButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(MONTHLY_ERROR);
  });

  it('clears an earlier error when the user resubmits', async () => {
    onOrient
      .mockRejectedValueOnce(new Error('GENERATION_FAILED'))
      .mockImplementationOnce(() => new Promise(() => {}));
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Try this again.' } });
    fireEvent.click(spreadButton('three'));
    fireEvent.click(orientButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERATION_ERROR);

    fireEvent.click(orientButton());
    expect(await screen.findByRole('status')).toHaveTextContent(LOADING_COPY);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onOrient).toHaveBeenCalledTimes(2);
  });
});

describe('ContextEntry rate-limited state', () => {
  it('replaces the form with Quick Draw, the playful note, and the draw loader', () => {
    renderEntry({ rateLimited: true });

    expect(screen.getByRole('heading', { name: 'Quick Draw' })).toBeVisible();
    expect(
      screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === RATE_LIMIT_NOTE),
    ).toBeVisible();
    expect(screen.queryByLabelText('Context')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help Me Orient' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Help Me Orient' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Draw code' })).toBeVisible();
    expect(screen.queryByText('❦')).not.toBeInTheDocument();
  });

  it('draws through onQuickDrawSelect when a spread is clicked', () => {
    renderEntry({ rateLimited: true });

    fireEvent.click(spreadButton('single'));
    expect(onQuickDrawSelect).toHaveBeenCalledTimes(1);
    expect(onQuickDrawSelect).toHaveBeenCalledWith('single');
    expect(onOrient).not.toHaveBeenCalled();
  });
});

describe('ContextEntry deliberate quick draw', () => {
  it('switches to Quick Draw without the note and returns with Context intact', () => {
    renderEntry();

    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Keep me around.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draw for fun instead' }));

    expect(screen.getByRole('heading', { name: 'Quick Draw' })).toBeVisible();
    expect(screen.queryByText(/tapped out on Orientation Guides/)).not.toBeInTheDocument();
    expect(screen.queryByText('❦')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Draw code' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Help Me Orient' }));
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.getByLabelText('Context')).toHaveValue('Keep me around.');
  });
});
