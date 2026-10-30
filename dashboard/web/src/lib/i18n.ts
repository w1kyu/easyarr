import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '~/locales/en.json';

// English only in v1, but every user-facing string goes through i18n (SPEC §15).
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  // Keys contain dots (e.g. "home.title"); they are flat, not nested.
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
