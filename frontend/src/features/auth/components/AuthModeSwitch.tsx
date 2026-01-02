interface AuthModeSwitchProps {
  mode: "login" | "signup"; // Current form mode
  onToggle: () => void; // Function to switch between login and signup
}

export const AuthModeSwitch = ({ mode, onToggle }: AuthModeSwitchProps) => (
  <div className="text-center text-sm">
    <span className="text-gray-500">
      {mode === "login" ? "New to Annam?" : "Already have an account?"}
    </span>
    <button
      onClick={onToggle} // Call toggle function when clicked
      className="text-green-400 underline ml-1" // Styling for the toggle button
      type="button" // Ensure it doesn't submit a form
      aria-label={`Switch to ${mode === "login" ? "signup" : "login"}`}
    >
      {mode === "login" ? "Sign up" : "Sign in"} 
    </button>
  </div>
);
