import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AboutApp } from './components/AboutApp';
import './styles.css';
import {startPwa} from './pwa/client';

const isAboutPage = new URLSearchParams(window.location.search).get('page') === 'about';

if (isAboutPage) {
  document.title = 'このアプリについて | Local Document Preprocessor';
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => {
      void startPwa();
    },
    { once: true },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAboutPage ? <AboutApp /> : <App />}
  </StrictMode>,
);
