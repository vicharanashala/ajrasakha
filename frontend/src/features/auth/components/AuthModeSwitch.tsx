interface AuthModeSwitchProps {
  mode: "login" | "signup" | "forgot";
  onToggle: () => void;
}

export const AuthModeSwitch = ({ mode, onToggle }: AuthModeSwitchProps) => {
  if (mode === "forgot") return null; // no mode switch on forgot password screen

  return (
    <div className="text-center text-sm">
      <span className="text-gray-500">
        {mode === "login" ? "New to Annam?" : "Already have an account?"}
      </span>
      <button
        onClick={onToggle}
        className="text-green-400 underline ml-1 cursor-pointer hover:text-green-300 hover:underline-offset-2 transition-all duration-200"
        type="button"
        aria-label={`Switch to ${mode === "login" ? "signup" : "login"}`}
      >
        {mode === "login" ? "Sign up" : "Sign in"}
      </button>
    </div>
  );
};
