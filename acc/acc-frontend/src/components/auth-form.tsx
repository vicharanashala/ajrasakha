import React, { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { Label } from "./atoms/label";
import { Input } from "./atoms/input";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, UserPlus, LogIn } from "lucide-react";
import { loginWithEmail, signUpWithEmail } from "@/lib/firebase";
import { toast } from "sonner";

interface AuthFormProps extends React.ComponentProps<"div"> {}

export const calculatePasswordStrength = (password: string) => {
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

export const AuthForm = ({
  className,
  ...props
}: AuthFormProps) => {
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (isSignUpMode) {
      if (!formData.firstName.trim()) {
        newErrors.firstName = "First name is required";
      }
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (isSignUpMode && formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    const isValid = validateForm();

    if (!isValid) {
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    setIsLoading(true);
    try {
      const { firstName, lastName, email, password } = formData;

      if (isSignUpMode) {
        // Handle Sign Up
        const result = await signUpWithEmail(firstName, lastName, email, password);
        const displayName = `${firstName} ${lastName}`.trim() || email.split("@")[0];

        setUser({
          uid: result.user.uid,
          email: result.user.email || "",
          name: displayName,
          avatar: result.user.photoURL || "",
        });
        toast.success("Account created successfully! Welcome to Annam Call Center.");
        navigate({ to: "/call-agent-dashboard" });
      } else {
        // Handle Sign In
        const result = await loginWithEmail(email, password);

        setUser({
          uid: result!.user.uid,
          email: result!.user.email || "",
          name: result!.user.displayName || email.split("@")[0],
          avatar: result!.user.photoURL || "",
        });
        toast.success("Successfully logged in.");
        navigate({ to: "/call-agent-dashboard" });
      }
    } catch (error: any) {
      console.error("Auth failed", error);
      toast.error(error.message || `Failed to ${isSignUpMode ? "sign up" : "sign in"}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUpMode((prev) => !prev);
    setErrors({});
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-screen items-center justify-center p-4 relative overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-200/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
        <CardHeader className="p-0 text-center flex flex-col items-center justify-center gap-2">
          <img
            src="/logo.png"
            alt="Annam Logo"
            className="w-12 h-12 object-contain mx-auto"
          />
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent whitespace-nowrap">
            {isSignUpMode ? "Create Annam Account" : "Annam Call Center Login"}
          </CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {isSignUpMode
              ? "Register a new staff account to access the call portal"
              : "Enter your credentials to access your dashboard"}
          </p>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-4">
          <form onSubmit={handleEmailAuth}>
            <div className="grid gap-4">
              {/* First Name & Last Name (Sign Up Mode Only) */}
              {isSignUpMode && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor="firstName"
                      className="text-xs font-semibold text-gray-700 dark:text-gray-300"
                    >
                      First Name *
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="h-10 border-2 focus:border-green-400 transition-colors duration-300 text-sm"
                    />
                    {errors.firstName && (
                      <p className="text-xs text-red-500">{errors.firstName}</p>
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <Label
                      htmlFor="lastName"
                      className="text-xs font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="h-10 border-2 focus:border-green-400 transition-colors duration-300 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div className="grid gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300"
                >
                  Email Address *
                </Label>
                <Input
                  id="email"
                  name="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="h-10 border-2 focus:border-green-400 transition-colors duration-300 text-sm"
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="grid gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300"
                >
                  Password *
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={isSignUpMode ? "Create a strong password" : "Enter your password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    className="h-10 border-2 focus:border-green-400 transition-colors duration-300 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password}</p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                className="w-full h-11 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center cursor-pointer btn-primary-emerald mt-2 gap-2"
                type="submit"
                disabled={isLoading}
              >
                {isSignUpMode ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span className="text-sm font-semibold">
                  {isLoading ? "Please wait..." : isSignUpMode ? "Create Account" : "Sign In"}
                </span>
              </Button>

              {/* Toggle Mode Switcher */}
              <div className="text-center pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {isSignUpMode ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-bold text-primary-accent hover:underline bg-transparent border-none cursor-pointer"
                  >
                    {isSignUpMode ? "Sign In" : "Sign Up"}
                  </button>
                </p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
