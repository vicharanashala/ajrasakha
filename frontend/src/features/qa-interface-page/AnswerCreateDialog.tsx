
export const AnswerCreateDialog=()=>{
  return(
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
                        <svg
                          className="w-8 h-8 text-gray-400 dark:text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                          No Question Selected
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Select a question from the right side to view its
                          details, add your response, or check existing
                          responses.
                        </p>
                      </div>

                      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <svg
                              className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Getting Started
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Choose any question from the list to start
                              drafting responses or reviewing existing answers.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
  )

}