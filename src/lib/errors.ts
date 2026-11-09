/**
 * An error whose message is safe and useful to show to the admin (e.g. "That seat
 * line already exists"). Anything else is logged and replaced with a generic message.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
