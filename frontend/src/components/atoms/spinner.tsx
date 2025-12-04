import React from "react";

interface SpinnerProps {
  text?: string;
  offsetTop?: boolean;
}

export const Spinner: React.FC<SpinnerProps> = ({
  offsetTop = true,
  text = "Loading",
}) => {
  return (
    <div
      className={`fixed z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm ${
        offsetTop ? "inset-x-0 bottom-0 md:top-[100px]" : "inset-0"
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Agriculture-themed spinner with wheat stalks */}
        <div className="relative h-20 w-20">
          {/* Outer rotating ring */}
          <div
            className="absolute inset-0 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary"
            style={{ animationDuration: "1.5s" }}
          ></div>

          {/* Inner content - wheat/plant icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative animate-pulse">
              {/* Leaf icon */}
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-primary"
              >
                <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Loading text */}
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-primary">{text}</span>
          <span className="flex gap-1">
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: "0ms" }}
            ></span>
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: "150ms" }}
            ></span>
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: "300ms" }}
            ></span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Spinner;
