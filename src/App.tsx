import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState } from 'react';
import { About } from './screens/About';
import { Check } from './screens/Check';
import { Home } from './screens/Home';
import { Result } from './screens/Result';
import { Settings } from './screens/Settings';
import { Solve } from './screens/Solve';
import { dropStaleSession } from './store/actions';
import { useSession, useSettings } from './store/stores';

type Screen = 'home' | 'set' | 'settings' | 'about';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const session = useSession((s) => s.session);
  const size = useSettings((s) => s.size);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    dropStaleSession();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.size = size;
  }, [size]);

  // 画面が変わったら先頭から表示する
  // biome-ignore lint/correctness/useExhaustiveDependencies: 画面と問題の位置が変わったときだけ動かす
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, session?.phase, session?.index]);

  const home = () => setScreen('home');

  if (screen === 'set' && session) {
    if (session.phase === 'solve') return <Solve session={session} onExit={home} />;
    if (session.phase === 'check') return <Check session={session} onExit={home} />;
    return <Result session={session} onHome={home} />;
  }
  if (screen === 'settings') return <Settings onBack={home} onAbout={() => setScreen('about')} />;
  if (screen === 'about') return <About onBack={() => setScreen('settings')} />;
  return (
    <Home
      onOpen={() => setScreen('set')}
      onSettings={() => setScreen('settings')}
      updateReady={needRefresh}
      onUpdate={() => void updateServiceWorker(true)}
    />
  );
}
