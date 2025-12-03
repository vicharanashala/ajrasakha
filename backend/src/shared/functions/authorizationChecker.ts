import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import admin from 'firebase-admin';
import serviceAccount from '../../../agriai-a2fba-firebase-adminsdk-fbsvc-452072d744.json' with {type: 'json'};
export async function authorizationChecker(action): Promise<boolean> {
  let auth: any;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        serviceAccount as admin.ServiceAccount,
      ),
    });
  }
  auth = admin.auth();
  const firebaseAuthService = getFromContainer(FirebaseAuthService);
  const token = action.request.headers.authorization?.split(' ')[1];
  if (!token) {
    return false; // No token provided
  }
  await firebaseAuthService.getCurrentUserFromToken(token);
  const decoded = await firebaseAuthService.getCurrentUserFromToken(token)
  if(decoded.isBlocked){
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