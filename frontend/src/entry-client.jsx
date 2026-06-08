import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

const container = document.getElementById('root');
const isSsrHydration = container?.dataset?.ssr === 'true';

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

if (isSsrHydration) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
