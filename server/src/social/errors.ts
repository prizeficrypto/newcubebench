/**
 * Errors the social routes turn into clean JSON responses. Each carries an
 * HTTP status and a stable machine-readable `code` the client can branch on
 * (the message is for people and may change).
 */
export class SocialError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "SocialError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * Postgres "undefined_table": the social migration hasn't been run on this
 * database yet. Answered with a 503 the client treats as "feature off".
 */
export function isMissingTable(err: unknown): boolean {
  return (err as { code?: unknown })?.code === "42P01";
}

/** Postgres "unique_violation". */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown })?.code === "23505";
}

export const UNAVAILABLE = {
  error: "Social features aren't set up yet.",
  code: "social_unavailable",
} as const;
