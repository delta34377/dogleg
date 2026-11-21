import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initMonitoring } from './utils/monitoring';

// Start error reporting first. Does nothing unless REACT_APP_SENTRY_DSN is set.
initMonitoring();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* Last line of defence: a crash anywhere shows "Something went wrong"
        with Reload / Go home buttons instead of a blank white screen */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
