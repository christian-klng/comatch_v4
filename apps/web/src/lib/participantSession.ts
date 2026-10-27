// Sitzungstoken und Zwischenstand je Event im Browser. Zugriffe können in privaten Fenstern
// scheitern; dann läuft die App ohne Wiederherstellung weiter.

const tokenKey = (slug: string) => `comatch:token:${slug}`;
const draftKey = (slug: string) => `comatch:answers:${slug}`;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Speicher nicht verfügbar
  }
}

export const loadToken = (slug: string) => read(() => localStorage, tokenKey(slug));
export const saveToken = (slug: string, token: string | null) =>
  write(() => localStorage, tokenKey(slug), token);

/** Antworten, die noch nicht abgeschickt sind (übersteht ein Neuladen der Seite). */
export function loadDraftAnswers(slug: string): Record<string, string> {
  try {
    return JSON.parse(read(() => sessionStorage, draftKey(slug)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveDraftAnswers(slug: string, answers: Record<string, string> | null) {
  write(() => sessionStorage, draftKey(slug), answers && JSON.stringify(answers));
}
