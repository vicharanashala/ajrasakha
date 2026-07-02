import { ForbiddenError } from 'routing-controllers';
import { IUser } from '#shared/interfaces/models.js';

export function verifyNotTester(user: IUser): void {
  if (user && user.role === 'tester') {
    throw new ForbiddenError('Tester role has view-only access');
  }
}
