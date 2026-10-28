import { Link } from "react-router";

/** Kleine Fußzeile mit Datenschutz und Impressum. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link to="/datenschutz" className="underline-offset-4 hover:underline">
        Datenschutz
      </Link>
      {" · "}
      <Link to="/impressum" className="underline-offset-4 hover:underline">
        Impressum
      </Link>
    </p>
  );
}
