export const validateEmail = (email: string, domain = "annam.ai") => {
  if (!email) return "Email is required";
  if (!new RegExp(`^[^\\s@]+@${domain}$`).test(email))
    return `Please enter a valid email (${domain})`;
  return "";
};

export const validatePassword = (password: string) => {
  if (!password) return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters";
  return "";
};

export const validateName = (name: string) => {
  if (!name) return "Name is required";
  if (!/^[a-zA-Z\s]+$/.test(name)) return "Name cannot contain numbers or special chars";
  return "";
};
