import { FULL_DECK } from '../data/systemsTarot';

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function imageFilename(card) {
  if (card.cardType === 'Major') {
    return `major_${String(card.number).padStart(2, '0')}_${slugify(card.name)}.png`;
  }
  const suit = card.cardType.toLowerCase();
  return `${suit}_${String(card.number).padStart(2, '0')}_${slugify(card.name)}.png`;
}

export function shuffleAndDraw(n) {
  const deck = [...FULL_DECK];
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}

export const SPREADS = {
  single: {
    label: 'Single Card',
    description: 'One perspective, right now.',
    positions: ['Draw'],
  },
  three: {
    label: 'Three Card',
    description: 'Context · Challenge · Opportunity',
    positions: ['Context', 'Challenge', 'Opportunity'],
  },
  decision: {
    label: 'Decision',
    description: 'Current State · Path A · Path B · Integration',
    positions: ['Current State', 'Path A', 'Path B', 'Integration'],
  },
  system: {
    label: 'System Analysis',
    description: 'Structure · Dynamics · Agents · Resources · Emergence',
    positions: ['Structure', 'Dynamics', 'Agents', 'Resources', 'Emergence'],
  },
};
