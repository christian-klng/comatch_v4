import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@comatch/shared";

/** Fachlicher Fehler mit HTTP-Status und maschinenlesbarem Code. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = "not_found") => new HttpError(404, what);

export function zodIssues(error: ZodError): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    issues[key] ??= issue.message;
  }
  return issues;
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  let status = 500;
  let body: ApiErrorBody = { error: "internal" };

  if (error instanceof ZodError) {
    status = 400;
    body = { error: "validation", message: "Bitte Eingaben prüfen.", issues: zodIssues(error) };
  } else if (error instanceof HttpError) {
    status = error.status;
    body = { error: error.code, message: error.message };
  } else if ("statusCode" in error && error.statusCode && error.statusCode < 500) {
    status = error.statusCode;
    body = { error: error.code ?? "bad_request", message: error.message };
  }

  if (status >= 500) request.log.error({ err: error }, "Unerwarteter Fehler");
  return reply.code(status).send(body);
}
