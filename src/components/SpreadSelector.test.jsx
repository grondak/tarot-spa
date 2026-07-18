import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SpreadSelector from './SpreadSelector';

describe('SpreadSelector embedded layout', () => {
  it('keeps the standalone hero and full-screen wrapper by default', () => {
    const { container } = render(<SpreadSelector onSelect={vi.fn()} onLoadCode={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Systems Thinking Tarot' })).toBeVisible();
    expect(container.firstChild).toHaveClass('min-h-screen');
  });

  it('removes only the standalone framing when embedded', () => {
    const { container } = render(<SpreadSelector embedded onSelect={vi.fn()} onLoadCode={vi.fn()} />);

    expect(screen.queryByRole('heading', { name: 'Systems Thinking Tarot' })).not.toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass('min-h-screen');
    expect(container.firstChild).not.toHaveClass('bg-gray-950');
    expect(screen.getByRole('button', { name: /Single Card/ })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Draw code' })).toBeVisible();
  });
});

describe('SpreadSelector selection mode', () => {
  it('marks the selected option pressed and the others unpressed', () => {
    render(<SpreadSelector embedded selectedKey="single" onSelect={vi.fn()} onLoadCode={vi.fn()} />);

    const selected = screen.getByRole('button', { name: /Single Card/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    const spreadButtons = screen.getAllByRole('button', { name: /card/ });
    for (const button of spreadButtons) {
      expect(button).toHaveAttribute('type', 'button');
      if (button !== selected) expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('renders no aria-pressed attribute in default usage', () => {
    render(<SpreadSelector embedded onSelect={vi.fn()} onLoadCode={vi.fn()} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-pressed');
    }
  });

  it('omits the load-a-draw block when showLoadDraw is false', () => {
    render(<SpreadSelector embedded showLoadDraw={false} onSelect={vi.fn()} onLoadCode={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: 'Draw code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
  });
});
