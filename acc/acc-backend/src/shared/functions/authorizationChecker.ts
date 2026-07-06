import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';

export async function authorizationChecker(action): Promise<boolean> {
  getFirebaseAuth();
  const firebaseAuthService = getFromContainer(FirebaseAuthService);
  const token = action.request.headers.authorization?.split(' ')[1];
  if (!token) {
    return false;
  }
  try {
    const decoded = await firebaseAuthService.getCurrentUserFromToken(token);
    if (decoded.role === 'moderator' || decoded.role === 'expert') {
      if (decoded.status === 'in-active') {
        return false;
      }
    } else if (decoded.isBlocked) {
      return false;
    }
    if (!decoded?.firebaseUID) {
      return false;
    }
  } catch (error) {
    console.error('Authorization error:', error);
    return false;
  }
  return true;
}
