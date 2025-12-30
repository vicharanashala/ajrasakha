import { Label } from "@/components/atoms/label";
import type { AuthField, AuthFormData } from "../types";
import { Input } from "@/components/atoms/input";
import { Eye, EyeOff } from "lucide-react";

type AuthFieldsProps = {
  mode: "login" | "signup";
  formData: AuthFormData;
  errors: Partial<Record<keyof AuthFormData, string>>;
  signupFields: AuthField[];
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  getPasswordVisibility: (field: keyof AuthFormData) => {
    visible: boolean;
    toggle: () => void;
  };
  hasSubmitted: boolean;
};

export const AuthFields = ({
  mode,
  formData,
  errors,
  signupFields,
  handleInputChange,
  hasSubmitted,
  getPasswordVisibility,
}: AuthFieldsProps) => {
  return (
    <div className="grid gap-4">
      {signupFields.map((field, idx) => {
        // Skip "name" and "confirmPassword" fields in login mode
        if (
          mode !== "signup" &&
          (field.name === "name" || field.name === "confirmPassword")
        )
          return null;

        const isPassword = field.type === "password";
        const passwordCtrl = isPassword
          ? getPasswordVisibility(field.name) // Get visibility state and toggle function
          : null;

        return (
          <div
            key={field.name}
            className="grid gap-2 animate-in fade-in-0 slide-in-from-left-2"
            style={{ animationDelay: `${idx * 100}ms` }} // Staggered animation delay
          >
            <Label htmlFor={field.name}>{field.label}</Label>

            <div className="relative">
              <Input
                id={field.name}
                name={field.name}
                type={
                  isPassword
                    ? passwordCtrl!.visible
                      ? "text"
                      : "password" // Show/hide password
                    : field.type
                }
                value={formData[field.name]}
                placeholder={field.placeholder}
                onChange={handleInputChange}
                className="h-11 pr-10 border-2 focus:border-green-400"
              />

              {isPassword && (
                <button
                  type="button"
                  onClick={passwordCtrl!.toggle} // Toggle password visibility
                  className="absolute inset-y-0 right-0 pr-3"
                >
                  {passwordCtrl!.visible ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {/* Icon changes */}
                </button>
              )}
            </div>

            {/* Display validation errors after form submission */}
            {hasSubmitted && errors[field.name] && (
              <p className="text-sm text-red-500">{errors[field.name]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
