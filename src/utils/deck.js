import { FULL_DECK } from '../data/systemsTarot';

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function imageFilename(card) {
  if (card.cardType === 'Major') {
    return `major_${String(card.number).padStart(2, '0')}_${slugify(card.name)}.webp`;
  }
  const suit = card.cardType.toLowerCase();
  return `${suit}_${String(card.number).padStart(2, '0')}_${slugify(card.name)}.webp`;
}

export function shuffleAndDraw(n) {
  const deck = [...FULL_DECK];
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n).map(card => ({
    ...card,
    inverted: Math.random() < 0.5,
  }));
}

export function encodeDraw(spreadKey, cards) {
  const cardStr = cards.map(c => {
    const idx = FULL_DECK.findIndex(d => d.name === c.name);
    return String(idx).padStart(2, '0') + (c.inverted ? '1' : '0');
  }).join('');
  return `${spreadKey}:${cardStr}`;
}

export function decodeDraw(raw) {
  const code = (raw || '').trim().toLowerCase();
  const colon = code.indexOf(':');
  if (colon === -1) return null;
  const spreadKey = code.slice(0, colon);
  const cardStr = code.slice(colon + 1);
  if (!SPREADS[spreadKey]) return null;
  const expected = SPREADS[spreadKey].positions.length;
  if (cardStr.length !== expected * 3) return null;
  const cards = [];
  for (let i = 0; i < cardStr.length; i += 3) {
    const idx = parseInt(cardStr.slice(i, i + 2), 10);
    const inverted = cardStr[i + 2] === '1';
    if (isNaN(idx) || idx < 0 || idx >= FULL_DECK.length) return null;
    cards.push({ ...FULL_DECK[idx], inverted });
  }
  return { spreadKey, cards };
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
