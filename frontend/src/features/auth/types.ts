import type { Dispatch, FormEvent, SetStateAction } from "react";

//Represents the form data for login/signup.
export type AuthFormData = {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
};

//Represents a single input field in the auth form.
export type AuthField = {
  name: keyof AuthFormData;
  label: string;
  placeholder: string;
  type: "text" | "email" | "password";
};

// Return type of the `useAuthForm` hook.
export type UseAuthFormReturn = {
  mode: "login" | "signup";
  formData: AuthFormData;
  errors: Record<string, string>;
  isLoading: boolean;

  showPassword: boolean;
  showConfirmPassword: boolean;
  passwordStrength: {
    value: number;
    label: string;
    color: string;
  };
  hasSubmitted: boolean;
  isEmailSent: boolean;

  setShowPassword: Dispatch<SetStateAction<boolean>>;
  setShowConfirmPassword: Dispatch<SetStateAction<boolean>>;

  handleModeChange: (mode: "login" | "signup") => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: FormEvent) => Promise<void>;
};

// Generic authentication error object.
export interface AuthError {
  code?: string;
  message?: string;
  [key: string]: any;
}
