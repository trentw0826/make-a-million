// As in the app: the tokens first, so the cascade layers keep their order (see main.tsx).
import '../theme/tokens.css';
import '../styles.css';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StyleGuide } from './StyleGuide';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <StyleGuide />
  </StrictMode>,
);
