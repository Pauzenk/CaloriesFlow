import { createContext, useContext, useState, type ReactNode } from "react";
import { translations, type Lang, type TranslationKey } from "@/lib/i18n";

type LanguageContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => String(key),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("calorieflow_lang");
      return stored === "ru" ? "ru" : "en";
    } catch {
      return "en";
    }
  });

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem("calorieflow_lang", l); } catch {}
  }

  function t(key: TranslationKey): string {
    return (translations[lang] as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? String(key);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
