import type { ApiErrorBody } from "@comatch/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: Record<string, string>;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
    this.status = status;
    this.code = body.error ?? "unknown";
    this.issues = body.issues ?? {};
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Wird als JSON gesendet, außer es ist ein Blob (dann roh mit dessen Content-Type). */
  body?: unknown;
  /** Sitzungstoken von Teilnehmenden (Admins nutzen das Cookie). */
  token?: string;
}

export async function api<T = void>(
  path: string,
  { method = "GET", body, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    headers["Content-Type"] = body.type;
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload,
      credentials: "same-origin",
      // Im schwachen Event-WLAN hängen Anfragen sonst unbegrenzt; Uploads dürfen länger dauern.
      signal: AbortSignal.timeout(body instanceof Blob ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, {
        error: "timeout",
        message: "Der Server antwortet gerade nicht. Bitte noch einmal versuchen.",
      });
    }
    throw new ApiError(0, { error: "network", message: "Keine Verbindung zum Server." });
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    if (res.status === 413) errorBody.message = "Die Datei ist zu groß.";
    throw new ApiError(res.status, errorBody);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Etwas ist schiefgelaufen.";
}
