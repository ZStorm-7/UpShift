import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser } from '../context/UserContext';
import { TRANSLATIONS, LanguageCode } from './translations';

type LanguageContextType = {
  language: LanguageCode;
  // Lets a screen change the language immediately, before it's been saved to a
  // profile. Onboarding needs this: a new user has no profile yet, so picking
  // "Español" on step 1 has to take effect right away for the remaining steps
  // rather than only after the profile is written at the very end.
  setLanguage: (code: LanguageCode) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile } = useUser();
  const [language, setLanguage] = useState<LanguageCode>('en');

  // Whenever a profile loads (sign-in, or onboarding finishing), adopt its
  // saved language. This keeps Firestore as the source of truth across
  // devices, while still allowing the local override above in between.
  useEffect(() => {
    if (profile?.language) {
      setLanguage(profile.language as LanguageCode);
    }
  }, [profile?.language]);

  const t = (key: string): string => {
    const table = TRANSLATIONS[language] as Record<string, string>;
    const fallback = TRANSLATIONS.en as Record<string, string>;
    // Falls back to English for any key not yet translated in the chosen
    // language, and to the raw key itself if it's missing everywhere (so a
    // typo shows up as an obviously-wrong string instead of a blank).
    return table[key] || fallback[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
