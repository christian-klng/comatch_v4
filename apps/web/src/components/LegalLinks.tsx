import { Link, useParams } from "react-router";
import { LEGAL_PATHS, useLanguage, useT } from "../i18n/index.tsx";

/**
 * Pfad zur Datenschutzerklärung. Auf den Seiten eines Events (/e/:slug) die Fassung dieses
 * Events: Sie nennt dessen Veranstalter als Verantwortlichen.
 */
export function usePrivacyPath(): string {
  const { slug } = useParams();
  const path = LEGAL_PATHS[useLanguage()].privacy;
  return slug ? `/e/${slug}${path}` : path;
}

/** Kleine Fußzeile mit Datenschutz und Impressum (in der Sprache der Seite, im Admin Deutsch). */
export function LegalLinks({ className }: { className?: string }) {
  const t = useT();
  const paths = LEGAL_PATHS[useLanguage()];
  const privacy = usePrivacyPath();
  return (
    <p className={className}>
      <Link to={privacy} className="underline-offset-4 hover:underline">
        {t.common.privacy}
      </Link>
      {" · "}
      <Link to={paths.imprint} className="underline-offset-4 hover:underline">
        {t.common.imprint}
      </Link>
    </p>
  );
}
