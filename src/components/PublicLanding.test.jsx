import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FULL_DECK } from '../data/systemsTarot';
import { encodeDraw } from '../utils/deck';
import PublicLanding from './PublicLanding';

const lede = "Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide. Draw your own Cards, Current Events are sourced live, and an LLM applies a systems-thinking Lens to your own situation in one shot — producing an Orientation Guide: not advice, not a summary, a different way of seeing the decision in front of you.";

describe('PublicLanding', () => {
  it('renders the pitch without account surfaces', () => {
    render(<PublicLanding />);

    expect(screen.getByRole('heading', { name: 'Systems Thinking Tarot' })).toBeVisible();
    expect(screen.getByText(lede)).toBeVisible();
    for (const label of ['Functional', 'Emotional', 'Social']) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant Invite Key' })).not.toBeInTheDocument();
  });

  it('draws, redraws, and returns to the landing pitch', () => {
    render(<PublicLanding />);

    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    expect(screen.getAllByText('Draw')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Draw Again' })).toBeVisible();
    expect(screen.getByText(/^single:/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Draw Again' }));
    expect(screen.getAllByText('Draw')).toHaveLength(2);
    expect(screen.getByText(/^single:/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText(lede)).toBeVisible();
  });

  it('loads a valid draw code and rejects an invalid one', () => {
    const { unmount } = render(<PublicLanding />);
    const code = encodeDraw('single', [{ ...FULL_DECK[0], inverted: false }]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Draw code' }), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByText(code)).toBeVisible();

    unmount();
    render(<PublicLanding />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Draw code' }), { target: { value: 'not-a-code' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByText('Unrecognized draw code.')).toBeVisible();
  });

  it('routes invite holders and account holders through distinct callbacks', () => {
    const onShowSignUp = vi.fn();
    const onShowLogIn = vi.fn();
    render(<PublicLanding onShowSignUp={onShowSignUp} onShowLogIn={onShowLogIn} />);

    fireEvent.click(screen.getByRole('button', { name: 'I have an Invite Key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(onShowSignUp).toHaveBeenCalledTimes(1);
    expect(onShowLogIn).toHaveBeenCalledTimes(1);
  });

  it('renders Request Access after Quick Draw', () => {
    render(<PublicLanding />);

    const quickDraw = screen.getByRole('heading', { name: 'Quick Draw' });
    const requestAccess = screen.getByRole('heading', { name: 'Request Access' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible();
    expect(quickDraw.compareDocumentPosition(requestAccess) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
