export type MlsErrorCode =
  | "invalid_query"
  | "configuration"
  | "authentication"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "invalid_response";

export class MlsError extends Error {
  constructor(
    readonly code: MlsErrorCode,
    readonly publicMessage: string,
    readonly status: number,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = "MlsError";
  }
}

export function invalidQuery(message: string) {
  return new MlsError("invalid_query", message, 400, false);
}
