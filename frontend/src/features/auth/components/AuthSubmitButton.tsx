import { Button } from "@/components/atoms/button";

interface AuthSubmitButtonProps {
  mode: "login" | "signup"; // determines button label
  isLoading: boolean; // disables button and shows loading state
}

/**
 * AuthSubmitButton component
 * Renders a primary action button for login or signup forms.
 * Disables itself and shows a loading label when `isLoading` is true.
 * @returns JSX
 */
export const AuthSubmitButton = ({
  mode,
  isLoading,
}: AuthSubmitButtonProps) => {
  // Determine button label based on mode and loading state
  const buttonLabel = isLoading
    ? "Please wait..."
    : mode === "login"
    ? "Sign In"
    : "Create Account";

  return (
    <Button
      type="submit"
      disabled={isLoading} // native button disable
      className={`
        w-full h-12 rounded-md font-semibold shadow-lg
        hover:shadow-xl transition-all duration-300
        transform hover:scale-[1.02] active:scale-[0.98]
        flex items-center justify-center bg-primary
      `}
      style={{
        color: "#FFFFFF",
        opacity: isLoading ? 0.7 : 1, // faded appearance when loading
        pointerEvents: isLoading ? "none" : "auto", // prevent clicks while loading
      }}
    >
      <span className="font-semibold text-sm">{buttonLabel}</span>
    </Button>
  );
};
