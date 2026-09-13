interface ErrorMessageProps {
  message?: string
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <p className="text-red-700 font-medium text-lg">⚠️ Something went wrong</p>
      <p className="text-red-600 text-sm mt-1">
        {message || 'Could not connect to the API. Make sure the backend is running on port 8000.'}
      </p>
      <p className="text-gray-400 text-xs mt-3">
        Run: <span className="font-mono bg-gray-100 px-1 rounded">uvicorn main:app --reload</span>
      </p>
    </div>
  )
}
