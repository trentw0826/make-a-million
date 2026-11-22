// The tokens come before anything else: they declare the cascade layers (base, then ui), and
// a layer ranks by where it is first seen, so no component's styles may load ahead of them.
import './theme/tokens.css';
import './styles.css';
// The type, bundled with the app so no font is fetched from elsewhere.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
