import React from "react";

interface ErrorMessageProps {
  message?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="p-4 py-1 bg-red-100 dark:bg-red-700 text-red-800 dark:text-red-200 rounded-md my-2">
      {message}
    </div>
  );
};

export default ErrorMessage;
