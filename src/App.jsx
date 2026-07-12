import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { SPREADS, shuffleAndDraw, encodeDraw, decodeDraw } from './utils/deck';
import SpreadSelector from './components/SpreadSelector';
import SpreadView from './components/SpreadView';
import SignUp from './components/SignUp';

export default function App() {
  const [authState, setAuthState] = useState('loading');
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    async function refreshAuth() {
      try {
        await getCurrentUser();
        setAuthState('authenticated');
      } catch {
        setAuthState('unauthenticated');
      }
    }

    refreshAuth();
    return Hub.listen('auth', refreshAuth);
  }, []);

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

  if (authState === 'loading') {
    return <main className="min-h-screen bg-gray-950" aria-label="Loading account" />;
  }

  if (authState === 'unauthenticated') {
    return <SignUp onConfirmed={() => setAuthState('authenticated')} />;
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
