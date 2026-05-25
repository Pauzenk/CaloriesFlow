import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export function SetupPrompt({ message }: { message?: string }) {
  const { t } = useLanguage();
  return (
    <div className="border border-[#1C1714]/20 p-8 text-center font-['Space_Mono'] text-[#1C1714]">
      <p className="text-[10px] uppercase tracking-widest opacity-40 mb-3">{t("setupRequired")}</p>
      <p className="text-sm opacity-60 mb-5 max-w-xs mx-auto leading-relaxed">
        {message ?? t("setupToUseFeature")}
      </p>
      <Link href="/settings">
        <button
          type="button"
          data-testid="button-setup-prompt"
          className="border border-[#1C1714] px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
        >
          {t("fillInParameters")}
        </button>
      </Link>
    </div>
  );
}
