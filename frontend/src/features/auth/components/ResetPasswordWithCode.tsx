import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { useForgotPassword } from "@/hooks/api/auth/useForgotPassword";
import { useResetPassword } from "@/hooks/api/auth/useResetPassword";
import { calculatePasswordStrength } from "../utils/passwordStrength";
import { validateEmail, validateStrongPassword } from "../utils/validate";
import { PasswordStrength } from "./PasswordStrength";

interface ResetPasswordWithCodeProps {
  onBackToLogin: () => void;
}

type ResetStep = "email" | "code" | "done";

/**
 * Forgot password flow for backend (MongoDB) login: the user requests an emailed code,
 * then enters the code with a new password.
 */
export const ResetPasswordWithCode = ({ onBackToLogin }: ResetPasswordWithCodeProps) => {
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutateAsync: requestCode, isPending: isSending } = useForgotPassword();
  const { mutateAsync: resetPassword, isPending: isResetting } = useResetPassword();
  const strength = calculatePasswordStrength(newPassword);

  // Asks the backend to email a code; the response is the same whether or not the email exists.
  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    const emailError = validateEmail(email.trim());
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }
    try {
      await requestCode(email.trim());
      setErrors({});
      setStep("code");
      toast.success("If this email is registered, a reset code has been sent.");
    } catch {
      toast.error("Could not send the reset code. Please try again.");
    }
  };

  // Validates the code and new password, then updates the password.
  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!/^\d{6}$/.test(otp)) nextErrors.otp = "Enter the 6 digit code from the email";
    const passwordError = validateStrongPassword(newPassword);
    if (passwordError) nextErrors.newPassword = passwordError;
    if (newPassword !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await resetPassword({
        email: email.trim(),
        otp,
        newPassword,
        newPasswordConfirm: confirmPassword,
      });
      setStep("done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset password");
    }
  };

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Password updated</h3>
        <p className="text-gray-600 dark:text-gray-400">
          You can now log in with your new password.
        </p>
        <Button onClick={onBackToLogin} className="w-full h-11 bg-primary text-white font-semibold rounded-md">
          Go to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {step === "email" ? (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your email address and we will send you a 6 digit code to reset your password.
          </p>
          <form onSubmit={sendCode} className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="reset-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>
              <Input
                id="reset-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <Button type="submit" disabled={isSending} className="w-full h-11 bg-primary text-white font-semibold rounded-md">
              {isSending ? "Sending..." : "Send Code"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter the code sent to <span className="font-semibold">{email}</span> and choose a new password.
            The code is valid for 10 minutes.
          </p>
          <form onSubmit={submitReset} className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="reset-otp" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Reset Code
              </label>
              <Input
                id="reset-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className={errors.otp ? "border-red-500" : ""}
              />
              {errors.otp && <p className="text-xs text-red-500">{errors.otp}</p>}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="reset-new-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="reset-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`pr-10 ${errors.newPassword ? "border-red-500" : ""}`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 pr-3"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword}</p>}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="reset-confirm-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm New Password
              </label>
              <Input
                id="reset-confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? "border-red-500" : ""}
              />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>
            <PasswordStrength
              formData={{ email, password: newPassword, confirmPassword, name: "" }}
              strength={strength}
            />
            <Button type="submit" disabled={isResetting} className="w-full h-11 bg-primary text-white font-semibold rounded-md">
              {isResetting ? "Updating..." : "Reset Password"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={isSending}
            className="text-sm text-primary hover:underline mx-auto"
          >
            {isSending ? "Sending..." : "Resend code"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onBackToLogin}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mx-auto"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Login
      </button>
    </div>
  );
};
