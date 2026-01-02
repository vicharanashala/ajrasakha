import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { AuthFormData } from "../types";

interface PasswordStrengthProps {
  formData: AuthFormData;
  strength: {
    value: number; // Strength percentage (0-100)
    label: string; // Strength label (Weak, Medium, Strong)
    color: string; // Tailwind color class for strength bar
  };
}

export const PasswordStrength = ({
  formData,
  strength,
}: PasswordStrengthProps) => {
  if (!formData.password) return null; // Hide component if password is empty

  return (
    <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Password Strength
        </span>
        <span
          className={cn(
            "text-xs font-bold",
            strength.value <= 25 && "text-red-500",
            strength.value > 25 && strength.value <= 50 && "text-yellow-500",
            strength.value > 50 && strength.value <= 75 && "text-blue-500",
            strength.value > 75 && "text-green-500"
          )}
        >
          {strength.label}
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={cn(
            "h-2 rounded-full transition-all duration-500 ease-out",
            strength.color
          )}
          style={{ width: `${strength.value}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Check
            className={cn(
              "h-3 w-3 transition-colors duration-300",
              formData.password.length >= 8 ? "text-green-500" : "text-gray-400"
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
              /\d/.test(formData.password) ? "text-green-500" : "text-gray-400"
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
  );
};
