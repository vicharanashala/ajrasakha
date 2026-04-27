import { type ComponentProps } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { useAuthForm } from "../hooks/useAuthForm";
import { signupFields } from "../utils/fields";
import type { AuthFormData } from "../types";
import { AuthLayout } from "./AuthLayout";
import { AuthCardHeader } from "./AuthCardHeader";
import { AuthFields } from "./AuthFields";
import { PasswordStrength } from "./PasswordStrength";
import { AuthModeSwitch } from "./AuthModeSwitch";
import { AuthSubmitButton } from "./AuthSubmitButton";
import { Check, ArrowLeft } from "lucide-react";

interface AuthFormProps extends ComponentProps<"div"> {
  mode?: "login" | "signup" | "forgot";
  onModeChange?: (mode: "login" | "signup" | "forgot") => void;
}

export const AuthForm = ({ mode: initialMode = "login" }: AuthFormProps) => {
  const {
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
  } = useAuthForm(initialMode);

  // Toggle visibility for password fields
  const getPasswordVisibility = (fieldName: keyof AuthFormData) => {
    if (fieldName === "password") {
      return {
        visible: showPassword,
        toggle: () => setShowPassword((p) => !p),
      };
    }

    return {
      visible: showConfirmPassword,
      toggle: () => setShowConfirmPassword((p) => !p),
    };
  };

  return (
    <AuthLayout>
      <Card className="w-full max-w-md z-10">
        <AuthCardHeader mode={mode} /> {/* Header showing current mode */}
        <CardContent>
          {isEmailSent ? (
            <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {mode === "forgot" ? "Check your email" : "Check your email"}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                {mode === "forgot" ? (
                  <>
                    We've sent a password reset link to{" "}
                    <span className="font-semibold">{formData.email}</span>.
                    Please check your inbox.
                  </>
                ) : (
                  <>
                    We've sent a verification link to{" "}
                    <span className="font-semibold">{formData.email}</span>.
                    Please verify your email to complete your registration.
                  </>
                )}
              </p>
              <Button
                onClick={() => handleModeChange("login")}
                className="w-full h-11 bg-primary text-white font-semibold rounded-md shadow-md hover:shadow-lg transition-all"
              >
                Go to Login
              </Button>
            </div>
          ) : mode === "forgot" ? (
            <div className="grid gap-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-1.5">
                  <label htmlFor="forgot-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Address
                  </label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={errors.email ? "border-red-500" : ""}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-primary text-white font-semibold rounded-md shadow-md hover:shadow-lg transition-all"
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => handleModeChange("login")}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-6">
              <AuthFields
                mode={mode}
                formData={formData}
                errors={errors}
                signupFields={signupFields}
                hasSubmitted={hasSubmitted}
                handleInputChange={handleInputChange}
                getPasswordVisibility={getPasswordVisibility}
              />
              {mode === "login" && (
                <div className="flex justify-end -mt-4">
                  <button
                    type="button"
                    onClick={() => handleModeChange("forgot")}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              {mode === "signup" && (
                <PasswordStrength
                  formData={formData}
                  strength={passwordStrength}
                />
              )}
              <AuthSubmitButton mode={mode} isLoading={isLoading} />
              <AuthModeSwitch
                mode={mode}
                onToggle={
                  () => handleModeChange(mode === "login" ? "signup" : "login")
                }
              />
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
