import axios from 'axios';

export async function getFirebaseToken(
  email: string,
  password: string,
): Promise<string> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY!;

  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      email,
      password,
      returnSecureToken: true,
    },
  );

  return response.data.idToken;
}
