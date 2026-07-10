import React, { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { Label } from "./atoms/label";
import { Input } from "./atoms/input";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { loginWithEmail } from "@/lib/firebase";
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
  const [formData, setFormData] = useState({
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
    if (!formData.email) {
      newErrors.email = "Email is required";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    const isValid = validateForm();

    if (!isValid) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    try {
      const { email, password } = formData;
      const result = await loginWithEmail(email, password);

      setUser({
        uid: result!.user.uid,
        email: result!.user.email || "",
        name: result!.user.displayName || email.split("@")[0],
        avatar: result!.user.photoURL || "",
      });
      toast.success("Successfully logged in.");
      navigate({ to: "/call-agent-dashboard" });
    } catch (error: any) {
      console.error("Auth failed", error);
      toast.error(error.message || "Incorrect email or password.");
    } finally {
      setIsLoading(false);
    }
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
            ACC Call Center Login
          </CardTitle>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-4">
          <form onSubmit={handleEmailAuth}>
            <div className="grid gap-6">
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
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="h-11 border-2 focus:border-green-400 transition-colors duration-300 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password}</p>
                )}
              </div>

              <Button
                className="w-full h-12 rounded-md font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center cursor-pointer bg-primary mt-3"
                style={{
                  color: "#FFFFFF",
                  border: "none",
                  opacity: isLoading ? 0.7 : 1,
                  pointerEvents: isLoading ? "none" : "auto",
                }}
                type="submit"
                disabled={isLoading}
              >
                <span
                  style={{
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  {isLoading ? "Please wait..." : "Sign In"}
                </span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
