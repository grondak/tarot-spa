import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HowItWorks from './HowItWorks';

describe('HowItWorks', () => {
  it('renders the explanation and calls onBack', () => {
    const onBack = vi.fn();
    render(<HowItWorks onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'How it works' })).toBeVisible();
    expect(screen.getByText(/OODA loop/)).toBeVisible();
    expect(screen.getByText(/Getting in:/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('draws three live cards and can redraw them', () => {
    render(<HowItWorks />);

    expect(screen.getByText('Context')).toBeVisible();
    expect(screen.getByText('Challenge')).toBeVisible();
    expect(screen.getByText('Opportunity')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Draw again' }));

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('shows an example Orientation Guide screenshot', () => {
    render(<HowItWorks />);

    const img = screen.getByAltText(/Example Orientation Guide/);
    expect(img).toBeVisible();
    expect(img.getAttribute('src')).toContain('guide-example.png');
  });
});
