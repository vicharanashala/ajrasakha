import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';

export async function authorizationChecker(action): Promise<boolean> {
  getFirebaseAuth();
  const firebaseAuthService = getFromContainer(FirebaseAuthService);
  const token = action.request.headers.authorization?.split(' ')[1];
  if (!token) {
    return false; // No token provided
  }
  await firebaseAuthService.getCurrentUserFromToken(token);
  const decoded = await firebaseAuthService.getCurrentUserFromToken(token)
  // Moderators and Experts: access is gated by activity status, NOT isBlocked —
  // isBlocked is their availability flag (check-in/checkout) and must not deny
  // access. Every other role is unchanged: isBlocked denies access as before.
  if (decoded.role === 'moderator' || decoded.role === 'expert' || decoded.role === 'gate_keeper' || decoded.role === 'auditor') {
    if (decoded.status === 'in-active') {
      return false
    }
  } else if (decoded.isBlocked) {
    return false
  }
  if (!decoded?.firebaseUID) {
    return false
  }
  // const existingUser = await firebaseAuthService.findByFirebaseUID(decoded.firebaseUID);
  // if (!existingUser) {
  //   console.log("User authenticated in Firebase but not in DB")
  //   await this.auth.deleteUser(decoded?.firebaseUID).catch(err => {
  //     console.error("failed to delete firebase user ", err)
  //   })
  //   console.log("deleted firebase user ")
  //   // return false
  // }
  // return true
  try {
    // await firebaseAuthService.getCurrentUserFromToken(token);
  }
  catch (error) {
    console.error('Authorization error:', error);
    return false; // Invalid token or user not found
  }
  return true; // Authorization successful
}
