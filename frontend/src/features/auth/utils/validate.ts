export const validateEmail = (email: string) => {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Please enter a valid email address";
  return "";
};

export const validatePassword = (password: string) => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return "";
};

// Mirrors the backend password policy used when passwords are stored in MongoDB.
export const validateStrongPassword = (password: string) => {
  const basicError = validatePassword(password);
  if (basicError) return basicError;
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain a special character";
  return "";
};

export const validateName = (name: string) => {
  if (!name) return "Name is required";
  if (!name.trim()) return "Name cannot be blank or empty spaces";
  if (!/^[a-zA-Z\s]+$/.test(name)) return "Name cannot contain numbers or special chars";
  return "";
};
