// Returns a t(key) translation function tied to the current staff member's
// preferredLanguage Firestore field.  Falls back to English for any missing key.
//
// Usage:
//   const { t, lang } = useTranslation();
//   <p>{t('goodMorning')}</p>
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';

export function useTranslation() {
  const { userProfile } = useAuth();
  const [lang, setLang] = useState('en');

  useEffect(() => {
    // userProfile.staffId is written to /users/{uid} when the Auth account is
    // created or when Login.jsx creates the missing /users doc.
    if (!userProfile?.staffId) return;

    const unsub = onSnapshot(doc(db, 'staff', userProfile.staffId), (snap) => {
      if (snap.exists()) {
        const preferred = snap.data().preferredLanguage;
        if (preferred) setLang(preferred);
      }
    });

    return unsub;
  }, [userProfile?.staffId]);

  /** Look up a translation key.  Returns the English fallback if not found. */
  function t(key) {
    return translations[lang]?.[key] ?? translations['en']?.[key] ?? key;
  }

  return { t, lang };
}
