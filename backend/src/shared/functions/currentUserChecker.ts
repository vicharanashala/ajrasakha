import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {getFromContainer, UnauthorizedError} from 'routing-controllers';
import {CurrentUserChecker} from 'routing-controllers';
import {Request} from 'express';
import {IUser} from '../interfaces/models.js';

export const currentUserChecker: CurrentUserChecker = async (
  action,
): Promise<IUser> => {
  const request = action.request as Request;

  const authService = getFromContainer(FirebaseAuthService);

  const token = request.headers.authorization?.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  try {
    const user = await authService.getCurrentUserFromToken(token);

    if (!user) {
      throw new UnauthorizedError('Invalid token or user not found');
    }

    return user;
  } catch (err) {
    throw new UnauthorizedError('Failed to authenticate user');
  }
};
