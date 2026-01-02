import { type ComponentProps } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import { useAuthForm } from "../hooks/useAuthForm";
import { signupFields } from "../utils/fields";
import type { AuthFormData } from "../types";
import { AuthLayout } from "./AuthLayout";
import { AuthCardHeader } from "./AuthCardHeader";
import { AuthFields } from "./AuthFields";
import { PasswordStrength } from "./PasswordStrength";
import { AuthModeSwitch } from "./AuthModeSwitch";
import { AuthSubmitButton } from "./AuthSubmitButton";

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
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
