import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { env } from "./env.js";

export const firebaseConfig = {
  apiKey: env.firebase.apiKey(),
  authDomain: env.firebase.authDomain(),
  projectId: env.firebase.projectId(),
  storageBucket: env.firebase.storageBucket(),
  messagingSenderId: env.firebase.messagingSenderId(),
  appId: env.firebase.appId(),
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
