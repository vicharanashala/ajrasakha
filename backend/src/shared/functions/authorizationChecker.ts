import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";

export async function authorizationChecker(action: any): Promise<boolean> {
  try {
    const token = action.request.headers.authorization?.split(' ')[1];
    if (!token) {
      return false; // No token provided
    }

    const firebaseAuthService = getFromContainer(FirebaseAuthService);
    const decoded = await firebaseAuthService.getCurrentUserFromToken(token);
    if (!decoded || !decoded.firebaseUID) {
      return false;
    }

    // Moderators and Experts: access is gated by activity status, NOT isBlocked —
    // isBlocked is their availability flag (check-in/checkout) and must not deny
    // access. Every other role is unchanged: isBlocked denies access as before.
    if (
      decoded.role === 'moderator' ||
      decoded.role === 'expert' ||
      decoded.role === 'gate_keeper' ||
      decoded.role === 'auditor'
    ) {
      if (decoded.status === 'in-active') {
        return false;
      }
    } else if (decoded.isBlocked) {
      return false;
    }

    return true; // Authorization successful
  } catch (error) {
    console.error('Authorization error:', error);
    return false; // Invalid token, auth failure or user not found
  }
}

