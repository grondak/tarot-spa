import { useState } from 'react';
import { SPREADS, shuffleAndDraw, encodeDraw, decodeDraw } from './utils/deck';
import SpreadSelector from './components/SpreadSelector';
import SpreadView from './components/SpreadView';

export default function App() {
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);

  function handleSelect(key) {
    const n = SPREADS[key].positions.length;
    setCards(shuffleAndDraw(n));
    setSpreadKey(key);
  }

  function handleDrawAgain() {
    const n = SPREADS[spreadKey].positions.length;
    setCards(shuffleAndDraw(n));
  }

  function handleBack() {
    setSpreadKey(null);
    setCards([]);
  }

  function handleLoadCode(code) {
    const result = decodeDraw(code);
    if (!result) return false;
    setCards(result.cards);
    setSpreadKey(result.spreadKey);
    return true;
  }

  if (spreadKey) {
    return (
      <SpreadView
        spread={SPREADS[spreadKey]}
        cards={cards}
        drawCode={encodeDraw(spreadKey, cards)}
        onDrawAgain={handleDrawAgain}
        onBack={handleBack}
      />
    );
  }

  return <SpreadSelector onSelect={handleSelect} onLoadCode={handleLoadCode} />;
}
