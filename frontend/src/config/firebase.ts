import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyBF36YXhR791AdLHx5_A2QYd51bBFiHV1E",
  authDomain: "vibe-5b35a.firebaseapp.com",
  projectId: "vibe-5b35a",
  storageBucket: "vibe-5b35a.firebasestorage.app",
  messagingSenderId: "239934307367",
  appId: "1:239934307367:web:04aeea0334693e39856202",
  measurementId: "G-BCHEVMK4GE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();