import React, { useState } from "react";
import { cn } from "@/lib/utils";

import { useAuthStore } from "@/stores/authStore";
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

  const navigate = useNavigate();

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
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = "Please confirm your password";
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

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

  return (
    <div
      className={cn(
        "flex flex-col min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background to-muted/20",
        className
      )}
      {...props}
    >
      {/* Logo */}

      <Card className="w-full max-w-md">
        <div className="flex items-center justify-center w-full space-x-3 pe-35">
          <img src="/logo.png" alt="Annam Logo" className="h-8 w-auto" />

          <CardHeader className="p-0">
            <CardTitle className="text-lg font-semibold whitespace-nowrap">
              {mode === "login" ? " Welcome back" : "Create your account"}
            </CardTitle>
          </CardHeader>
        </div>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              <div className="flex flex-col gap-4">
                <Button
                  variant="outline"
                  className="w-full"
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="mr-2 h-4 w-4"
                  >
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  {isLoading
                    ? "Please wait..."
                    : `${mode === "login" ? "Login" : "Sign up"} with Google`}
                </Button>
              </div>

              <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-card px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>

              <div className="grid gap-6">
                <div className="grid gap-3">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    placeholder="m@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    {mode === "login" && (
                      <a
                        href="#"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
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
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>

                {mode === "signup" && (
                  <div className="grid gap-3">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                    />
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading
                    ? "Please wait..."
                    : mode === "login"
                    ? "Login"
                    : "Create Account"}
                </Button>
              </div>

              {/* Mode Toggle */}
              <div className="text-center text-sm">
                {mode === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() =>
                    handleModeChange(mode === "login" ? "signup" : "login")
                  }
                  className="underline underline-offset-4 hover:no-underline"
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
