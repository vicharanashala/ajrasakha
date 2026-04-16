import { CardHeader, CardTitle } from "@/components/atoms/card";

interface AuthCardHeaderProps {
  mode: "login" | "signup" | "forgot";
}

export const AuthCardHeader = ({ mode }: AuthCardHeaderProps) => (
  <CardHeader className="p-0 text-center flex flex-col items-center gap-2">
    <img src="/logo.png" alt="Annam Logo" className="w-12 h-12" />
    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent">
      {mode === "login" ? "Welcome Back" : mode === "signup" ? "Join Annam" : "Reset Password"}
    </CardTitle>
  </CardHeader>
);
