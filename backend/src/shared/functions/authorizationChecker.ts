import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import { appConfig } from "#root/config/app.js";

export async function authorizationChecker(action): Promise<boolean> {
  if (!appConfig.isDevelopment) {
    const { getFirebaseAuth } = await import('#root/config/firebaseAdmin.js');
    getFirebaseAuth();
  }
  const firebaseAuthService = getFromContainer(FirebaseAuthService);
  const token = action.request.headers.authorization?.split(' ')[1];
  if (!token) {
    return false;
  }
  const decoded = await firebaseAuthService.getCurrentUserFromToken(token);
  if (decoded.role === 'moderator' || decoded.role === 'expert') {
    if (decoded.status === 'in-active') {
      return false
    }
  } else if (decoded.isBlocked) {
    return false
  }
  if (!decoded?.firebaseUID) {
    return false
  }
  return true;
}
