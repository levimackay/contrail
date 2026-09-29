/** An error whose message is written for the user. Anything else that reaches the CLI is a bug. */
export class ContrailError extends Error {
  override name = 'ContrailError';
}
