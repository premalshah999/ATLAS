import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, setCurrentStore, type ScreenId } from './lib/store';
import { AtlasApp } from './shell/app';
import { isDesktop, platform } from './lib/runtime';

document.documentElement.dataset.platform = platform;
document.documentElement.dataset.runtime = isDesktop ? 'desktop' : 'web';

// First launch shows Welcome; afterwards ATLAS opens on the last screen.
const last = (() => { try { return localStorage.getItem('atlas:screen') as ScreenId | null; } catch { return null; } })();
const store = createStore({ screen: last ?? 'welcome' });
setCurrentStore(store);
store.subscribe(() => { try { localStorage.setItem('atlas:screen', store.get().screen); } catch { /* storage unavailable */ } });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AtlasApp store={store} frame={false} />
  </React.StrictMode>,
);
