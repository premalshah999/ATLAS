import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/app.css';
import './styles/live.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LiveApp } from './live/app';
import { bridge } from './live/api';

document.documentElement.dataset.platform = bridge?.platform ?? 'web';
document.documentElement.dataset.runtime = bridge ? 'desktop' : 'web';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LiveApp />
  </React.StrictMode>,
);
