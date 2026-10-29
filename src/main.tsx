import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PersonalProvider } from './personal';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersonalProvider>
      <App />
    </PersonalProvider>
  </StrictMode>,
);
