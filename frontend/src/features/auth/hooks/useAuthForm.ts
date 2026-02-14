import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { loginWithEmail } from "@/lib/firebase";
import { useSignup } from "@/hooks/api/auth/useSignup";
import { calculatePasswordStrength } from "../utils/passwordStrength";
import {
  validateEmail,
  validatePassword,
  validateName,
} from "../utils/validate";
import type { AuthError, AuthFormData, UseAuthFormReturn } from "../types";

/**
 * Custom hook to manage the state and behavior of an Auth form
 * (both login and signup modes).
 *
 * @param initialMode - Either "login" or "signup". Defaults to "login".
 * @returns An object containing form state, handlers, and helpers.
 */
export const useAuthForm = (
  initialMode: "login" | "signup" = "login"
): UseAuthFormReturn => {
  // -------------------------------
  // Form state
  // -------------------------------
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [formData, setFormData] = useState<AuthFormData>({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({}); // validation errors
  const [isLoading, setIsLoading] = useState(false); // tracks API submission
  const [showPassword, setShowPassword] = useState(false); // password visibility toggle
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // confirm password visibility
  const [hasSubmitted, setHasSubmitted] = useState(false); // tracks if the form has been submitted
  const [isEmailSent, setIsEmailSent] = useState(false); // tracks if verification email was sent

  const { setUser } = useAuthStore(); // global auth store
  const { mutateAsync: signupMutation } = useSignup(); // signup API hook
  const navigate = useNavigate(); // router navigation

  // Calculate password strength on each password change
  const passwordStrength = calculatePasswordStrength(formData.password);

  // -------------------------------
  // Handlers
  // -------------------------------

  // Update form state when an input changes
  // Clears error for the changed field
  const handleModeChange = (newMode: "login" | "signup") => {
    setHasSubmitted(false); // reset submission state to avoid premature validation
    setMode(newMode); // update current mode
    setErrors({}); // clear errors
    setIsEmailSent(false); // reset email sent state
    setFormData({ email: "", password: "", confirmPassword: "", name: "" }); // reset fields
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  /**
   * Validate form fields based on current modeDD
   * Updates the errors state object
   * @returns true if the form is valid, false otherwise
   */
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const emailError = validateEmail(formData.email);
    if (emailError) newErrors.email = emailError;

    const passwordError = validatePassword(formData.password);
    if (passwordError) newErrors.password = passwordError;

    if (mode === "signup") {
      const nameError = validateName(formData.name);
      if (nameError) newErrors.name = nameError;

      if (!formData.confirmPassword && formData.password)
        newErrors.confirmPassword = "Please confirm your password";
      else if (formData.password !== formData.confirmPassword)
        newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handles form submission
  // Calls signup/login APIs and updates global user state
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setHasSubmitted(true);

    // Stop submission if form is invalid
    if (!validateForm()) {
      toast.error("Please fix form errors.");
      return;
    }

    setIsLoading(true);
    try {
      const { email, password, name } = formData;
      const firstName = name || email.split("@")[0];
      const lastName = "";

      let result;
      if (mode === "signup") {
        // Call signup API
        await signupMutation({ email, password, firstName, lastName });
        setIsEmailSent(true);
        return;
      } else {
        // Login API
        result = await loginWithEmail(email, password);
      }

      // Save user info in global store
      setUser({
        uid: result!.user.uid,
        email: result!.user.email || "",
        name: result!.user.displayName || firstName,
        avatar: result!.user.photoURL || "",
      });

      navigate({ to: "/home" });
    } catch (error: unknown) {
      const authError = error as AuthError;
      console.error("Auth failed", error);

      const code = authError.code || authError.message;

      if (!authError.message?.includes("verify your email")) {
        console.error("Auth failed", error);
      }
      if (code === "auth/email-already-in-use" || code === "EMAIL_EXISTS") {
        toast.error("This email is already registered. Please log in instead.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "INVALID_LOGIN_CREDENTIALS"
      ) {
        toast.error("Invalid Credentials");
      } else {
        // toast.error("Something went wrong. Please try again.");
        let message =
          authError.message || "Something went wrong. Please try again.";

        try {
          // Look for embedded JSON in error message
          const match = message.match(/{.*}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            message = parsed.message || message;
          }

          // Clean up verbose prefixes like “Signup failed: 500 Internal Server Error - ”
          message = message.replace(/^.*Internal Server Error - /, "").trim();

          // Handle Firebase/backend specific error messages
          if (message.includes("EMAIL_NOT_FOUND")) {
            message = "Invalid Credentials";
          } else if (message.includes("INVALID_PASSWORD")) {
            message = "Invalid Credentials";
          } else if (message.includes("USER_DISABLED")) {
            message = "This account has been disabled.";
          }
        } catch (e) {
          // fallback: do nothing, use original message
        }
        if (message === "User Is Blocked. Please Contact Moderator") {
          toast.warning(authError.message);
        } else {
          toast.error(message);
        }
      }
    } finally {
      setIsLoading(false);
      setErrors({});
    }
  };

  // Return all relevant states and handlers
  return {
    mode,
    formData,
    errors,
    isLoading,
    showPassword,
    showConfirmPassword,
    passwordStrength,
    setShowPassword,
    setShowConfirmPassword,
    handleModeChange,
    handleInputChange,
    handleSubmit,
    hasSubmitted,
    isEmailSent,
  };
};
