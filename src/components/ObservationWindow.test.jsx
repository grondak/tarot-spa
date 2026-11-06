import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ObservationWindow from './ObservationWindow';
import { HOUR } from '../utils/observation/timeline';
import {
  NOW, feedRows, hoursAgo, itemRow, itemRows, poolFeedRows, poolItemRows, runRows,
} from '../utils/observation/fixtures';

const data = { feeds: feedRows, items: itemRows, runs: runRows };

async function renderWindow(overrides = {}) {
  const props = {
    loadFn: vi.fn().mockResolvedValue(data),
    widenFn: vi.fn().mockResolvedValue({ synonyms: [], broader: [] }),
    nowFn: () => NOW,
    ...overrides,
  };
  render(<ObservationWindow {...props} />);
  await screen.findByRole('heading', { name: 'Observation Window' });
  return props;
}

const cards = () => screen.queryAllByRole('article');
const cardTitles = () => cards().map((card) => card.querySelector('a, span.font-semibold').textContent);
const slider = () => screen.getByLabelText('Timeline scrubber');
const search = () => screen.getByLabelText('Search titles and text');
const type = (text) => fireEvent.change(search(), { target: { value: text } });

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('ObservationWindow loading', () => {
  it('shows a loading note, then the window', async () => {
    let resolve;
    render(<ObservationWindow loadFn={() => new Promise((r) => { resolve = r; })} nowFn={() => NOW} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the news…');
    await act(async () => resolve(data));
    expect(screen.getByRole('heading', { name: 'Observation Window' })).toBeVisible();
  });

  it('says it could not load, and tries again', async () => {
    const loadFn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(data);
    render(<ObservationWindow loadFn={loadFn} nowFn={() => NOW} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Observation Window' })).toBeVisible();
    expect(loadFn).toHaveBeenCalledTimes(2);
  });

  it('says when nothing has been collected yet', async () => {
    render(<ObservationWindow loadFn={vi.fn().mockResolvedValue({ feeds: feedRows, items: [], runs: [] })} nowFn={() => NOW} />);
    expect(await screen.findByText(/No news has been collected yet/)).toBeVisible();
  });

  it('summarises what was loaded', async () => {
    await renderWindow();
    expect(screen.getByText(/6 items from 4 sources/)).toBeVisible();
    expect(screen.getByText(/Last collected/)).toBeVisible();
    expect(screen.getByText('Live')).toBeVisible();
  });
});

describe('ObservationWindow scrubbing', () => {
  it('shows the cards around "now" first, in source order', async () => {
    await renderWindow();
    expect(cardTitles()).toEqual(['Weather today', 'Tariffs rise on steel', 'Ceasefire talks resume', 'Duty on imports debated']);
    expect(screen.getByText(/Co-occurrence is not a link/)).toBeVisible();
  });

  it('moves the window with the slider and snaps back with Go live', async () => {
    await renderWindow();
    fireEvent.change(slider(), { target: { value: String(NOW - 30 * HOUR) } });
    expect(cardTitles()).toEqual(['Chip supply improves']);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByTestId('needle').style.left).not.toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: 'Go live' }));
    expect(screen.getByText('Live')).toBeVisible();
    expect(cardTitles()).toContain('Weather today');
  });

  it('jumps to an item when its dot is clicked', async () => {
    await renderWindow();
    fireEvent.change(slider(), { target: { value: String(NOW - 30 * HOUR) } });
    const lane = screen.getByTestId('lane-lr');
    const dots = [...lane.querySelectorAll('[title]')].filter((el) => el.title.includes('Duty on imports'));
    fireEvent.click(dots[0]);
    expect(cardTitles()).toContain('Duty on imports debated');
  });

  it('changes the window and the number of cards', async () => {
    await renderWindow();
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '2' } });
    expect(cardTitles()).toEqual(['Weather today', 'Tariffs rise on steel']);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Cards'), { target: { value: '3' } });
    expect(cards()).toHaveLength(3);
    expect(screen.getByText('+1 more in this window at lower rank')).toBeVisible();
  });

  it('says when nothing is in the window', async () => {
    await renderWindow();
    fireEvent.change(slider(), { target: { value: String(NOW - 60 * HOUR) } });
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '2' } });
    expect(screen.getByText('Nothing in this window. Widen the window or keep scrubbing.')).toBeVisible();
  });

  it('plays forward to now and stops by itself', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<ObservationWindow loadFn={vi.fn().mockResolvedValue(data)} nowFn={() => NOW} />);
    });
    fireEvent.change(slider(), { target: { value: String(NOW - 3 * HOUR) } });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();

    await act(async () => { vi.advanceTimersByTime(80); });
    expect(Number(slider().value)).toBe(NOW - 2 * HOUR);

    await act(async () => { vi.advanceTimersByTime(80 * 5); });
    expect(screen.getByText('Live')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  it('pauses on request and when the slider is touched', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<ObservationWindow loadFn={vi.fn().mockResolvedValue(data)} nowFn={() => NOW} />);
    });
    fireEvent.change(slider(), { target: { value: String(NOW - 4 * HOUR) } });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(Number(slider().value)).toBe(NOW - 4 * HOUR);
  });

  it('starts from the beginning when played from the end', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<ObservationWindow loadFn={vi.fn().mockResolvedValue(data)} nowFn={() => NOW} />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(Number(slider().value)).toBe(Number(slider().min));
  });

  it('marks collector gaps on the timeline', async () => {
    await renderWindow();
    expect(screen.getAllByTestId('gap')).toHaveLength(1);
  });
});

describe('ObservationWindow groups and solo', () => {
  it('shows groups with their lanes, and a retired source labelled', async () => {
    await renderWindow();
    expect(screen.getByTestId('group-world')).toBeVisible();
    expect(screen.getByTestId('group-telecom')).toBeVisible();
    expect(within(screen.getByTestId('lane-fierce')).getByText('(retired)')).toBeVisible();
  });

  it('collapses and expands a group, and remembers it', async () => {
    await renderWindow();
    fireEvent.click(within(screen.getByTestId('group-world')).getByRole('button', { expanded: true }));
    expect(screen.queryByTestId('lane-bbc')).not.toBeInTheDocument();
    expect(screen.getByTestId('lane-lr')).toBeVisible();
    expect(JSON.parse(localStorage.getItem('owCollapsedGroups'))).toEqual(['world']);

    fireEvent.click(within(screen.getByTestId('group-world')).getByRole('button', { expanded: false }));
    expect(screen.getByTestId('lane-bbc')).toBeVisible();
  });

  it('starts with the groups that were collapsed last time', async () => {
    localStorage.setItem('owCollapsedGroups', JSON.stringify(['telecom']));
    await renderWindow();
    expect(screen.queryByTestId('lane-lr')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeVisible();
  });

  it('survives unreadable stored groups', async () => {
    localStorage.setItem('owCollapsedGroups', '{not json');
    await renderWindow();
    expect(screen.getByTestId('lane-lr')).toBeVisible();
  });

  it('collapses and expands every group at once', async () => {
    await renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByTestId('lane-bbc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lane-lr')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByTestId('lane-bbc')).toBeVisible();
  });

  it('solos a group, then clears it with the button or Esc', async () => {
    await renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Solo telecom' }));
    expect(cardTitles()).toEqual(['Duty on imports debated']);
    expect(screen.getByRole('button', { name: 'Solo telecom' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/3 other items hidden by solo/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Clear solo (Esc)' }));
    expect(cards()).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Solo Al Jazeera' }));
    expect(cardTitles()).toEqual(['Ceasefire talks resume']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cards()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Clear solo (Esc)' })).not.toBeInTheDocument();
  });

  it('does not collapse a group when its solo button is clicked', async () => {
    await renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Solo world' }));
    expect(screen.getByTestId('lane-bbc')).toBeVisible();
  });
});

describe('ObservationWindow search', () => {
  it('shows only items with every typed word, and counts them', async () => {
    await renderWindow();
    type('ceasefire');
    expect(cardTitles()).toEqual(['Ceasefire talks resume']);
    expect(screen.getByText(/1 match in all/)).toBeVisible();
  });

  it('says why nothing matches, and offers whole word', async () => {
    await renderWindow();
    type('zzzz');
    expect(screen.getByText('No stored item contains "zzzz". Try a different word.')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Whole word'));
    expect(screen.getByText(/as a whole word/)).toBeVisible();
  });

  it('jumps between matches with the buttons and with Enter', async () => {
    await renderWindow();
    type('met');
    fireEvent.change(slider(), { target: { value: String(NOW - 2.5 * HOUR) } });
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(Number(slider().value)).toBe(Date.parse(hoursAgo(3)));
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(Number(slider().value)).toBe(Date.parse(hoursAgo(2)));
    fireEvent.keyDown(search(), { key: 'Enter', shiftKey: true });
    expect(Number(slider().value)).toBe(Date.parse(hoursAgo(3)));
  });

  it('disables a match button when there is nothing that way', async () => {
    await renderWindow();
    type('weather');
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
  });

  it('clears the search on Esc before it clears solo', async () => {
    await renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Solo world' }));
    type('ceasefire');
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(search()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clear solo (Esc)' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Clear solo (Esc)' })).not.toBeInTheDocument();
  });
});

describe('ObservationWindow widening', () => {
  const filler = Array.from({ length: 30 }, (_, i) => itemRow({
    title: `Filler story ${i}`,
    summary: 'Nothing to see.',
    publishedAt: new Date(NOW - (60 + i) * HOUR).toISOString(),
  }));
  const widened = { ...data, items: [...itemRows, ...filler] };

  it('widens a thin search with synonyms, labels related cards, and lets a word be removed', async () => {
    const widenFn = vi.fn().mockResolvedValue({ synonyms: ['duty'], broader: [] });
    await renderWindow({ loadFn: vi.fn().mockResolvedValue(widened), widenFn });

    type('tariff');
    expect(await screen.findByText(/Duty on imports debated/)).toBeVisible();
    expect(widenFn).toHaveBeenCalledWith('tariff');
    expect(screen.getByTestId('widened')).toHaveTextContent('so the search widened to word forms, synonyms and broader terms');
    expect(screen.getByText(/Related, not exact: “duty” \(synonym of “tariff”\)/)).toBeVisible();
    expect(cardTitles()).toEqual(['Tariffs rise on steel', 'Duty on imports debated']);

    fireEvent.click(screen.getByRole('button', { name: 'Stop searching “duty”' }));
    expect(cardTitles()).toEqual(['Tariffs rise on steel']);
    fireEvent.click(screen.getByRole('button', { name: 'Restore removed terms' }));
    expect(cardTitles()).toContain('Duty on imports debated');
  });

  it('asks about each typed word once, and not about short or odd words', async () => {
    const widenFn = vi.fn().mockResolvedValue({ synonyms: [], broader: [] });
    await renderWindow({ widenFn });
    type('ai');
    type('tariff');
    type('tariff ');
    type('tariff x1');
    await waitFor(() => expect(widenFn).toHaveBeenCalledWith('tariff'));
    expect(widenFn.mock.calls.filter(([term]) => term === 'tariff')).toHaveLength(1);
    expect(widenFn).not.toHaveBeenCalledWith('ai');
    expect(widenFn).not.toHaveBeenCalledWith('x1');
  });

  it('keeps the exact results when the lookup fails', async () => {
    const widenFn = vi.fn().mockRejectedValue(new Error('down'));
    await renderWindow({ loadFn: vi.fn().mockResolvedValue(widened), widenFn });
    type('tariff');
    await waitFor(() => expect(widenFn).toHaveBeenCalled());
    expect(cardTitles()).toEqual(['Tariffs rise on steel']);
    expect(screen.getByText(/No related terms found in your stored news/)).toBeVisible();
  });
});

describe('ObservationWindow cards', () => {
  it('links only to web addresses', async () => {
    const items = [
      itemRow({ title: 'Safe one', link: 'https://example.com/safe', publishedAt: hoursAgo(1) }),
      itemRow({ title: 'Sneaky one', link: 'javascript:alert(1)', publishedAt: hoursAgo(1) }),
    ];
    await renderWindow({ loadFn: vi.fn().mockResolvedValue({ ...data, items }) });
    const safe = screen.getByRole('link', { name: 'Safe one' });
    expect(safe).toHaveAttribute('href', 'https://example.com/safe');
    expect(safe).toHaveAttribute('rel', 'noopener noreferrer');
    expect(safe).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Sneaky one').closest('a')).toBeNull();
  });

  it('marks a date the feed did not give', async () => {
    await renderWindow();
    expect(screen.getByText(/\(date estimated\)/)).toBeVisible();
  });

  it('truncates a long summary and shows text as text, not markup', async () => {
    const items = [itemRow({ title: '<b>bold</b>', summary: `<i>x</i>${'y'.repeat(400)}`, publishedAt: hoursAgo(1) })];
    await renderWindow({ loadFn: vi.fn().mockResolvedValue({ ...data, items }) });
    expect(screen.getByText('<b>bold</b>')).toBeVisible();
    expect(document.querySelector('article b, article i')).toBeNull();
    expect(screen.getByText(/^<i>x<\/i>y+$/).textContent).toHaveLength(220);
  });
});

describe('ObservationWindow outside-interest picks', () => {
  const withPool = { feeds: [...feedRows, ...poolFeedRows], items: [...itemRows, ...poolItemRows], runs: runRows };
  const open = (props = {}) => renderWindow({ loadFn: vi.fn().mockResolvedValue(withPool), userId: 'user-1', ...props });

  it('shows the day\'s pick first, labelled with why it is there', async () => {
    await open();
    const [first] = cards();
    expect(within(first).getByText('Outside your interests.')).toBeVisible();
    expect(first).toHaveTextContent(/Peer-reviewed science\.|Essays on ideas\.|Space science\./);
    expect(screen.getByText(/Items from outside your interests are listed first/)).toBeVisible();
    expect(screen.getByTestId('group-outside your interests')).toBeVisible();
  });

  it('does not label ordinary cards', async () => {
    await open();
    const ordinary = cards().filter((c) => !c.textContent.includes('Outside your interests.'));
    expect(ordinary.length).toBeGreaterThan(0);
  });

  it('shows the same pick on every visit for the same user', async () => {
    await open();
    const first = cardTitles()[0];
    document.body.innerHTML = '';
    await open();
    expect(cardTitles()[0]).toBe(first);
  });

  it('stops showing a dismissed source, remembers it, and can restore it', async () => {
    await open();
    const [first] = cards();
    const button = within(first).getByRole('button', { name: /^Not interested in / });
    const label = button.textContent;
    fireEvent.click(button);

    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('owDismissedSources'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Restore 1 dismissed source' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Restore 1 dismissed source' }));
    expect(screen.queryByRole('button', { name: /Restore .* dismissed/ })).not.toBeInTheDocument();
    expect(localStorage.getItem('owDismissedSources')).toBe('[]');
  });

  it('starts with the sources dismissed last time', async () => {
    localStorage.setItem('owDismissedSources', JSON.stringify(['nature', 'aeon', 'nasa']));
    await open();
    expect(screen.queryByTestId('group-outside your interests')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore 3 dismissed sources' })).toBeVisible();
  });

  it('shows nothing outside the starter feeds when the pool has no news yet', async () => {
    await renderWindow({ loadFn: vi.fn().mockResolvedValue({ ...withPool, items: itemRows }), userId: 'user-1' });
    expect(screen.queryByTestId('group-outside your interests')).not.toBeInTheDocument();
  });
});

describe('ObservationWindow forgetting', () => {
  it('forgets collapsed groups and dismissed sources on request', async () => {
    localStorage.setItem('owCollapsedGroups', JSON.stringify(['telecom']));
    localStorage.setItem('owDismissedSources', JSON.stringify(['nature']));
    await renderWindow({
      loadFn: vi.fn().mockResolvedValue({ feeds: [...feedRows, ...poolFeedRows], items: [...itemRows, ...poolItemRows], runs: runRows }),
      userId: 'user-1',
    });
    expect(screen.queryByTestId('lane-lr')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore 1 dismissed source' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Forget my choices on this page' }));

    expect(screen.getByTestId('lane-lr')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Restore .* dismissed/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Forgotten.');
    expect(localStorage.getItem('owCollapsedGroups')).toBeNull();
    expect(localStorage.getItem('owDismissedSources')).toBeNull();
  });

  it('tells the user what is and is not stored', async () => {
    await renderWindow();
    expect(screen.getByText(/Nothing about what you look at is stored on our servers/)).toBeVisible();
  });
});

describe('ObservationWindow switching sources off', () => {
  const sources = () => screen.getByTestId('sources');

  it('takes a switched-off group off the timeline and out of the cards, and remembers it', async () => {
    await renderWindow();
    expect(screen.getByText('Sources and suggestions (4 of 4 on)')).toBeVisible();
    fireEvent.click(within(sources()).getByLabelText('telecom (whole group)'));

    expect(screen.queryByTestId('group-telecom')).not.toBeInTheDocument();
    expect(cardTitles()).not.toContain('Duty on imports debated');
    expect(JSON.parse(localStorage.getItem('owDisabledSources'))).toEqual(['g:telecom']);
    expect(screen.getByText(/Sources and suggestions \(1 of 4 on|Sources and suggestions \(2 of 4 on/)).toBeVisible();
  });

  it('keeps a source off across visits, and brings it back when switched on', async () => {
    localStorage.setItem('owDisabledSources', JSON.stringify(['f:aj']));
    await renderWindow();
    expect(screen.queryByTestId('lane-aj')).not.toBeInTheDocument();
    expect(cardTitles()).not.toContain('Ceasefire talks resume');

    fireEvent.click(within(sources()).getByLabelText('Al Jazeera'));
    expect(screen.getByTestId('lane-aj')).toBeVisible();
    expect(cardTitles()).toContain('Ceasefire talks resume');
    expect(JSON.parse(localStorage.getItem('owDisabledSources'))).toEqual([]);
  });

  it('switches the daily outside-interest pick off with its group', async () => {
    await renderWindow({
      loadFn: vi.fn().mockResolvedValue({ feeds: [...feedRows, ...poolFeedRows], items: [...itemRows, ...poolItemRows], runs: runRows }),
      userId: 'user-1',
    });
    expect(screen.getByTestId('group-outside your interests')).toBeVisible();
    fireEvent.click(within(sources()).getByLabelText('outside your interests (whole group)'));
    expect(screen.queryByTestId('group-outside your interests')).not.toBeInTheDocument();
  });

  it('explains an empty window when every source is off, and recovers', async () => {
    localStorage.setItem('owDisabledSources', JSON.stringify(['g:world', 'g:telecom']));
    await renderWindow({ loadFn: vi.fn().mockResolvedValue(data) }).catch(() => {});
    expect(await screen.findByText('Every source with news is switched off.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Switch every source back on' }));
    expect(await screen.findByLabelText('Timeline scrubber')).toBeVisible();
  });

  it('is cleared along with the other remembered choices', async () => {
    localStorage.setItem('owDisabledSources', JSON.stringify(['f:aj']));
    await renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Forget my choices on this page' }));
    expect(screen.getByTestId('lane-aj')).toBeVisible();
    expect(localStorage.getItem('owDisabledSources')).toBeNull();
  });
});

describe('ObservationWindow handoff to Orient', () => {
  it('has no button unless the page was given somewhere to send the cards', async () => {
    await renderWindow();
    expect(screen.queryByRole('button', { name: 'Orient on this moment' })).toBeNull();
  });

  it('sends the cards on screen as a "What I observed" block', async () => {
    const onOrient = vi.fn();
    await renderWindow({ onOrient });
    const titles = cardTitles();
    fireEvent.click(screen.getByRole('button', { name: 'Orient on this moment' }));
    expect(onOrient).toHaveBeenCalledTimes(1);
    const text = onOrient.mock.calls[0][0];
    expect(text).toContain('What I observed in the Observation Window (now):');
    for (const title of titles) expect(text).toContain(title);
  });

  it('is disabled while a Guide is in the way', async () => {
    const onOrient = vi.fn();
    await renderWindow({ onOrient, orientBlocked: true });
    const button = screen.getByRole('button', { name: 'Orient on this moment' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onOrient).not.toHaveBeenCalled();
  });
});
