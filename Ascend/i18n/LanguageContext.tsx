import { createContext, useContext, ReactNode } from 'react';
import { TRANSLATIONS } from './translations';

type LanguageContextType = {
  t: (key: string) => string;
};

// English only — the language picker (and every other language's
// dictionary) was removed. `t()` stays as the lookup function every screen
// already calls, so removing the picker didn't mean touching every `t('x')`
// call site in the app; it just means this table has one row now instead of
// twenty.
const LanguageContext = createContext<LanguageContextType>({
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const t = (key: string): string => {
    const table = TRANSLATIONS.en as Record<string, string>;
    // Falls back to the raw key if it's missing from the table, so a typo
    // shows up as an obviously-wrong string instead of a blank.
    return table[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
