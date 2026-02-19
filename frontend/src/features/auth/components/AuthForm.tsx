import { type ComponentProps } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { useAuthForm } from "../hooks/useAuthForm";
import { signupFields } from "../utils/fields";
import type { AuthFormData } from "../types";
import { AuthLayout } from "./AuthLayout";
import { AuthCardHeader } from "./AuthCardHeader";
import { AuthFields } from "./AuthFields";
import { PasswordStrength } from "./PasswordStrength";
import { AuthModeSwitch } from "./AuthModeSwitch";
import { AuthSubmitButton } from "./AuthSubmitButton";
import { Check } from "lucide-react";

interface AuthFormProps extends ComponentProps<"div"> {
  mode?: "login" | "signup"; // Optional initial mode
  onModeChange?: (mode: "login" | "signup") => void; // Optional callback for mode change
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Check your email</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                We've sent a verification link to <span className="font-semibold">{formData.email}</span>.
                Please verify your email to complete your registration.
              </p>
              <Button
                onClick={() => handleModeChange("login")}
                className="w-full h-11 bg-primary text-white font-semibold rounded-md shadow-md hover:shadow-lg transition-all"
              >
                Go to Login
              </Button>
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
              {mode === "signup" && (
                <PasswordStrength
                  formData={formData}
                  strength={passwordStrength} // Show password strength only on signup
                />
              )}
              <AuthSubmitButton mode={mode} isLoading={isLoading} />{" "}
              {/* Submit button */}
              <AuthModeSwitch
                mode={mode}
                onToggle={
                  () => handleModeChange(mode === "login" ? "signup" : "login") // Switch login/signup mode
                }
              />
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
