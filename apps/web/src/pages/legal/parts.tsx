// Bausteine für Impressum und Datenschutzerklärung in beiden Sprachen.
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Language, LegalInfo } from "@comatch/shared";
import { I18nProvider, LEGAL_PATHS, messagesFor } from "../../i18n/index.tsx";

export function Shell({
  language,
  title,
  children,
}: {
  language: Language;
  title: string;
  children: ReactNode;
}) {
  const t = messagesFor(language);
  const paths = LEGAL_PATHS[language];
  return (
    <I18nProvider language={language}>
      <div className="min-h-full bg-white text-slate-800">
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 text-[15px] leading-relaxed">
          <p className="text-sm">
            <span className="font-semibold">
              Co<span className="text-brand">Match</span>
            </span>
          </p>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          {children}
          <nav className="mt-6 flex gap-4 border-t border-slate-200 pt-4 text-sm text-slate-500">
            <Link to={paths.imprint} className="hover:text-slate-900">
              {t.common.imprint}
            </Link>
            <Link to={paths.privacy} className="hover:text-slate-900">
              {t.common.privacy}
            </Link>
          </nav>
        </main>
      </div>
    </I18nProvider>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function Missing({ language }: { language: Language }) {
  return (
    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
      {messagesFor(language).legal.missing}
    </p>
  );
}

export function Operator({ legal, language }: { legal: LegalInfo; language: Language }) {
  const t = messagesFor(language).legal;
  return (
    <address className="not-italic">
      {legal.name && <p className="font-medium">{legal.name}</p>}
      {legal.address?.split(/\n|,\s*/).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {legal.email && (
        <p>
          {t.email}:{" "}
          <a href={`mailto:${legal.email}`} className="text-brand underline">
            {legal.email}
          </a>
        </p>
      )}
      {legal.phone && (
        <p>
          {t.phone}: {legal.phone}
        </p>
      )}
    </address>
  );
}
