import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import { Analytics } from '@vercel/analytics/react';
import { createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, AppCrashed } from './App';
import { launchOptions } from './config';
import { reportCrash, startHostBridge } from './embed/bridge';
import { bootstrap } from './state/bootstrap';
import './styles/global.css';
import './styles/tokens.css';
import { ErrorBoundary } from './ui/ErrorBoundary';

bootstrap(launchOptions);
if (launchOptions.embed) startHostBridge();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const rootBoundary = createRef<ErrorBoundary>();

createRoot(container, {
  onCaughtError: (_error, { errorBoundary }) => {
    if (errorBoundary === rootBoundary.current) reportCrash();
  },
}).render(
  <StrictMode>
    <ErrorBoundary ref={rootBoundary} fallback={() => <AppCrashed />}>
      <App />
    </ErrorBoundary>
    <Analytics />
  </StrictMode>,
);
