export const calculatePasswordStrength = (password: string) => {
  if (!password) return { value: 0, label: "Weak", color: "bg-red-500" };

  let strength = 0;
  if (password.length >= 8) strength += 25;
  if (/[A-Z]/.test(password)) strength += 25;
  if (/\d/.test(password)) strength += 25;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 25;

  if (strength <= 25) return { value: strength, label: "Weak", color: "bg-red-500" };
  if (strength <= 50) return { value: strength, label: "Fair", color: "bg-yellow-500" };
  if (strength <= 75) return { value: strength, label: "Good", color: "bg-blue-500" };
  return { value: strength, label: "Strong", color: "bg-green-500" };
};
