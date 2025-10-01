import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

// Get saved language from localStorage or default to 'en'
const savedLanguage = localStorage.getItem('language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar }
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

// Save language to localStorage when it changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng);

  // Keep LTR direction always (no RTL, even for Arabic)
  document.documentElement.setAttribute('dir', 'ltr');
  document.documentElement.setAttribute('lang', lng);

  // Update body class for CSS targeting (font changes only)
  document.body.classList.remove('lang-ar', 'lang-en');
  document.body.classList.add(`lang-${lng}`);
});

// Set initial direction to LTR always
document.documentElement.setAttribute('dir', 'ltr');
document.documentElement.setAttribute('lang', savedLanguage);
// Add initial language class to body
document.body.classList.add(`lang-${savedLanguage}`);

export default i18n;