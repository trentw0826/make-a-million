import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// The type, bundled with the app so no font is fetched from elsewhere.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './theme/tokens.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
