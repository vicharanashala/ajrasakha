import type { AuthField } from "../types";

export const signupFields: AuthField[] = [
  {
    name: "name",
    label: "Full Name",
    placeholder: "Enter your full name",
    type: "text",
  },
  {
    name: "email",
    label: "Email Address",
    placeholder: "user@example.com",
    type: "email",
  },
  {
    name: "password",
    label: "Password",
    placeholder: "Enter your password",
    type: "password",
  },
  {
    name: "confirmPassword",
    label: "Confirm Password",
    placeholder: "Confirm your password",
    type: "password",
  },
];
