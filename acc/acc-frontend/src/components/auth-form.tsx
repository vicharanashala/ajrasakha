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
        "flex flex-col min-h-screen items-center justify-center p-4 relative overflow-hidden bg-slate-950",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <CardHeader className="p-6 text-center flex flex-col items-center justify-center gap-2">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent whitespace-nowrap">
            ACC Call Center login
          </CardTitle>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleEmailAuth}>
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-semibold text-slate-300"
                >
                  Email Address
                </Label>
                <Input
                  id="email"
                  name="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="h-11 border-slate-700 bg-slate-800 text-white focus:border-green-400"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-semibold text-slate-300"
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
                    className="h-11 border-slate-700 bg-slate-800 text-white focus:border-green-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
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
                className="w-full h-12 rounded-md font-semibold bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer border-none shadow-lg mt-3"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Please wait..." : "Sign In"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
