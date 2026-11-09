import { Link } from "react-router";
import { LEGAL_PATHS, useLanguage, useT } from "../i18n/index.tsx";

/** Kleine Fußzeile mit Datenschutz und Impressum (in der Sprache der Seite, im Admin Deutsch). */
export function LegalLinks({ className }: { className?: string }) {
  const t = useT();
  const paths = LEGAL_PATHS[useLanguage()];
  return (
    <p className={className}>
      <Link to={paths.privacy} className="underline-offset-4 hover:underline">
        {t.common.privacy}
      </Link>
      {" · "}
      <Link to={paths.imprint} className="underline-offset-4 hover:underline">
        {t.common.imprint}
      </Link>
    </p>
  );
}
