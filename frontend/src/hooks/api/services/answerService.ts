const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class AnswerService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async submitAnswer(questionId: string, answer: string): Promise<void> {
    try {
      const res = await fetch(this._baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, questionId }),
      });
      console.log("Response of login with google: ", res)
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to submit answer: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
}
