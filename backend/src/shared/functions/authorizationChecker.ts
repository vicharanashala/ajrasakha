import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';
import { appConfig } from '#root/config/app.js';

export async function authorizationChecker(action): Promise<boolean> {
  const token = action.request.headers.authorization?.split(' ')[1];
  if (!token) {
    if (appConfig.isDevelopment) {
      return true;
    }
    return false; // No token provided
  }

  try {
    getFirebaseAuth();
    const firebaseAuthService = getFromContainer(FirebaseAuthService);
    const decoded = await firebaseAuthService.getCurrentUserFromToken(token);
    if (!decoded) {
      if (appConfig.isDevelopment) return true;
      return false;
    }

    // Moderators and Experts: access is gated by activity status, NOT isBlocked —
    // isBlocked is their availability flag (check-in/checkout) and must not deny
    // access. Every other role is unchanged: isBlocked denies access as before.
    if (decoded.role === 'moderator' || decoded.role === 'expert' || decoded.role === 'gate_keeper' || decoded.role === 'auditor') {
      if (decoded.status === 'in-active') {
        return false;
      }
    } else if (decoded.isBlocked) {
      return false;
    }
    if (!decoded?.firebaseUID) {
      if (appConfig.isDevelopment) return true;
      return false;
    }
    return true; // Authorization successful
  } catch (error) {
    if (appConfig.isDevelopment) {
      return true;
    }
    console.error('Authorization error:', error);
    return false; // Invalid token or user not found
  }
}
