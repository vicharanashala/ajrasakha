export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  getIdToken(): Promise<string>;
};

export type UserCredential = {
  user: User;
  providerId: string | null;
  operationType: string | null;
};

export function onAuthStateChanged(
  auth: any,
  next: (user: User | null) => void,
  error?: (error: any) => void,
): () => void {
  setTimeout(() => next(null), 0);
  return () => {};
}

export async function signInWithPopup(
  auth: any,
  provider: any,
): Promise<UserCredential> {
  throw new Error("Google sign-in is not available in development mode");
}

export async function signOut(auth: any): Promise<void> {}

export async function getIdToken(user: any): Promise<string> {
  return localStorage.getItem("auth-token") || "";
}

export async function signInWithEmailAndPassword(
  auth: any,
  email: string,
  password: string,
): Promise<UserCredential> {
  throw new Error("Use loginWithEmail from @/lib/firebase instead");
}

export function getAuth(): any {
  return {
    get currentUser() {
      return null;
    },
  };
}

export class GoogleAuthProvider {
  constructor() {}
}

export class EmailAuthProvider {
  constructor(public email: string, public password: string) {}
}
