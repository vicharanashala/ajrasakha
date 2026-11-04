import {HttpError} from 'routing-controllers';

/** This routing-controllers version (0.11.3) doesn't ship a 409 — matches its own
 *  NotFoundError/BadRequestError shape exactly. */
export class ConflictError extends HttpError {
  constructor(message?: string) {
    super(409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
    if (message) this.message = message;
  }
}
