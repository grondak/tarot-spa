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
