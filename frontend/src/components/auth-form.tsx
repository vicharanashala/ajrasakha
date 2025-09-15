import React, { useState } from "react";
import { cn } from "@/lib/utils";

import { useAuthStore } from "@/stores/auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./atoms/card";
import { Button } from "./atoms/button";
import { Label } from "./atoms/label";
import { Input } from "./atoms/input";
import toast from "react-hot-toast";
import { useLoginWithGoogle } from "@/hooks/api/auth/useLoginWithGoogle";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { createUserWithEmail, loginWithEmail } from "@/lib/firebase";
import { useSignup } from "@/hooks/api/auth/useSignup";

interface AuthFormProps extends React.ComponentProps<"div"> {
  mode?: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
}

export const AuthForm = ({
  className,
  mode: initialMode = "login",
  onModeChange,
  ...props
}: AuthFormProps) => {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { loginWithGoogle, setUser } = useAuthStore();

  const {
    mutateAsync: saveGoogleUser,
    isPending: isGoogleLogin,
    isError: googleLoginError,
  } = useLoginWithGoogle();

  const {
    mutateAsync: signupMutation,
    error: signupError,
    isError: isSignUpError,
  } = useSignup();

  const navigate = useNavigate();

  const calculatePasswordStrength = (password: string) => {
    if (!password) return { value: 0, label: "Weak", color: "bg-red-500" };

    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 25;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 25;

    if (strength <= 25)
      return { value: strength, label: "Weak", color: "bg-red-500" };
    if (strength <= 50)
      return { value: strength, label: "Fair", color: "bg-yellow-500" };
    if (strength <= 75)
      return { value: strength, label: "Good", color: "bg-blue-500" };
    return { value: strength, label: "Strong", color: "bg-green-500" };
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    setErrors({});
    setFormData({ email: "", password: "", confirmPassword: "", name: "" });
    onModeChange?.(newMode);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (mode === "signup") {
      if (!formData.name) {
        newErrors.name = "Name is required";
      }
      if (!formData.confirmPassword && formData.password) {
        newErrors.confirmPassword = "Please confirm your password";
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    console.log("New error: ", newErrors);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Add your manual auth logic here
      if (mode === "login") {
        console.log("Login:", {
          email: formData.email,
          password: formData.password,
        });
      } else {
        console.log("Signup:", {
          name: formData.name,
          email: formData.email,
          password: formData.password,
        });
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setIsLoading(true);
      const result = await loginWithGoogle();
      if (!result) {
        toast.error("No response from firebase! try again.");
        return;
      }
      // Check if the user is new
      if (result?._tokenResponse?.isNewUser) {
        await saveGoogleUser(result);
      }

      setUser({
        uid: result.user.uid,
        email: result.user.email || "",
        name: result.user.displayName || "",
        avatar: result.user.photoURL || "",
      });
      navigate({ to: "/home" });
    } catch (error) {
      console.error("Google Login Failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    const isValid = validateForm();

    if (Object.keys(errors).length)
      toast.error("Please fix form errors before continuing.");
    if (!isValid) {
      return;
    }

    setIsLoading(true);
    try {
      const { email, password, name } = formData;
      const firstName = name || email.split("@")[0];
      const lastName = "";

      let result;

      if (mode === "signup") {
        result = await createUserWithEmail(email, password, firstName);

        await signupMutation({
          email,
          password,
          firstName,
          lastName,
        });
      } else {
        result = await loginWithEmail(email, password);
      }

      setUser({
        uid: result.user.uid,
        email: result.user.email || "",
        name: result.user.displayName || firstName,
        avatar: result.user.photoURL || "",
      });

      navigate({ to: "/home" });
    } catch (error: any) {
      console.error("Auth failed", error);

      const code = error.code || error.message;
      if (code === "auth/email-already-in-use" || code === "EMAIL_EXISTS") {
        toast.error("This email is already registered. Please log in instead.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "INVALID_LOGIN_CREDENTIALS"
      ) {
        toast.error("Incorrect email or password.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
      setErrors({});
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-screen items-center justify-center p-4 relative overflow-hidden",
        "bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50",
        "dark:from-green-950 dark:via-emerald-950 dark:to-teal-950",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-200/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-white dark:bg-gray-900 backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
        <CardHeader className="p-0 text-center">
          <CardTitle className="text-2xl inline-block w-full font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent whitespace-nowrap">
            {mode === "login" ? "Welcome Back" : "Join Annam"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-8 ">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              {/* Google button */}
              {mode == "login" && (
                <>
                  <div className="flex flex-col gap-4">
                    <Button
                      variant="outline"
                      className="w-full h-12 border-2 border-green-300 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-all duration-300 group bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      type="button"
                      onClick={handleGoogleAuth}
                      disabled={isLoading}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="mr-3 h-5 w-5 transition-transform duration-300 group-hover:scale-110"
                      >
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="text-gray-700 dark:text-gray-300 font-medium">
                        {isLoading
                          ? "Please wait..."
                          : `${
                              mode === "login" ? "Sign in" : "Sign up"
                            } with Google`}
                      </span>
                    </Button>
                  </div>

                  <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-green-200 dark:after:border-green-800">
                    <span className="relative z-10 bg-white dark:bg-gray-900 px-4 text-muted-foreground font-medium">
                      Or continue with email
                    </span>
                  </div>
                </>
              )}
              <div
                className={`grid ${
                  mode == "signup" ? "gap-2" : "gap-5"
                } animate-in fade-in-0 slide-in-from-right-2 duration-500 delay-200`}
              >
                {mode === "signup" && (
                  <div className="grid gap-2 animate-in fade-in-0 slide-in-from-left-2 duration-500 delay-300">
                    <Label
                      htmlFor="name"
                      className="text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="h-11 border-2 focus:border-green-400 transition-colors duration-300"
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500 animate-in fade-in-0 slide-in-from-left-1 duration-300">
                        {errors.name}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-2">
                  <Label
                    htmlFor="email"
                    className="text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="h-11 border-2 focus:border-green-400 transition-colors duration-300"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-500 animate-in fade-in-0 slide-in-from-left-1 duration-300">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="password"
                      className="text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Password
                    </Label>
                    {mode === "login" && (
                      <a
                        href="#"
                        className="text-sm text-green-600 hover:text-green-700 underline-offset-4 hover:underline transition-colors duration-300"
                      >
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="h-11 border-2 focus:border-green-400 transition-colors duration-300"
                  />
                  {errors.password && (
                    <p className="text-sm text-red-500 animate-in fade-in-0 slide-in-from-left-1 duration-300">
                      {errors.password}
                    </p>
                  )}
                </div>

                {mode === "signup" && (
                  <div className="grid gap-2 animate-in fade-in-0 slide-in-from-right-2 duration-500 delay-400">
                    <Label
                      htmlFor="confirmPassword"
                      className="text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Confirm Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="h-11 border-2 focus:border-green-400 transition-colors duration-300"
                    />
                    {errors.confirmPassword && (
                      <p className="text-sm text-red-500 animate-in fade-in-0 slide-in-from-left-1 duration-300">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {formData.password && mode == "signup" && (
                  <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Password Strength
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold",
                          passwordStrength.value <= 25 && "text-red-500",
                          passwordStrength.value > 25 &&
                            passwordStrength.value <= 50 &&
                            "text-yellow-500",
                          passwordStrength.value > 50 &&
                            passwordStrength.value <= 75 &&
                            "text-blue-500",
                          passwordStrength.value > 75 && "text-green-500"
                        )}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all duration-500 ease-out",
                          passwordStrength.color
                        )}
                        style={{ width: `${passwordStrength.value}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3 w-3 transition-colors duration-300",
                            formData.password.length >= 8
                              ? "text-green-500"
                              : "text-gray-400"
                          )}
                        />
                        <span
                          className={
                            formData.password.length >= 8
                              ? "text-green-700 dark:text-green-400"
                              : "text-gray-500"
                          }
                        >
                          8+ characters
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3 w-3 transition-colors duration-300",
                            /[A-Z]/.test(formData.password)
                              ? "text-green-500"
                              : "text-gray-400"
                          )}
                        />
                        <span
                          className={
                            /[A-Z]/.test(formData.password)
                              ? "text-green-700 dark:text-green-400"
                              : "text-gray-500"
                          }
                        >
                          Uppercase
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3 w-3 transition-colors duration-300",
                            /\d/.test(formData.password)
                              ? "text-green-500"
                              : "text-gray-400"
                          )}
                        />
                        <span
                          className={
                            /\d/.test(formData.password)
                              ? "text-green-700 dark:text-green-400"
                              : "text-gray-500"
                          }
                        >
                          Numbers
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3 w-3 transition-colors duration-300",
                            /[!@#$%^&*(),.?":{}|<>]/.test(formData.password)
                              ? "text-green-500"
                              : "text-gray-400"
                          )}
                        />
                        <span
                          className={
                            /[!@#$%^&*(),.?":{}|<>]/.test(formData.password)
                              ? "text-green-700 dark:text-green-400"
                              : "text-gray-500"
                          }
                        >
                          Special chars
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className="w-full h-12 rounded-md font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: isLoading ? "#6B7280" : "#16A34A",
                    color: "#FFFFFF",
                    border: "none",
                    opacity: isLoading ? 0.7 : 1,
                    pointerEvents: isLoading ? "none" : "auto",
                  }}
                  onClick={!isLoading ? handleSubmit : undefined}
                >
                  <span
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "600",
                      fontSize: "14px",
                    }}
                  >
                    {isLoading
                      ? "Please wait..."
                      : mode === "login"
                      ? "Sign In"
                      : "Create Account"}
                  </span>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="text-center text-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-700 delay-500">
                <span className="text-gray-600 dark:text-gray-400">
                  {mode === "login"
                    ? "New to Annam?"
                    : "Already have an account?"}{" "}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleModeChange(mode === "login" ? "signup" : "login")
                  }
                  className="font-semibold text-green-600 hover:text-green-700 underline-offset-4 hover:underline transition-all duration-300"
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
