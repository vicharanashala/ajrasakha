import { cn } from "@/lib/utils";

type AuthLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export const AuthLayout = ({ children, className }: AuthLayoutProps) => {
  return (
    <div
      className={cn(
        "flex flex-col min-h-screen items-center justify-center p-4 relative overflow-hidden",
        className // Merge additional classes if provided
      )}
    >
      {/* Decorative blurred background circles */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-teal-200/10 rounded-full blur-3xl animate-pulse delay-500 -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Auth form or other children */}
      {children}
    </div>
  );
};
