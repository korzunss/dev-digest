/** Failure raised by a `DevDigestApi` adapter. `code` is `unreachable`, `timeout`, `no_run`, or the API's own `error.code`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
