//Added new function to check LLM
	//Vale from .env file
	//GEMINI_API_KEY=AIzaSyCTr-temPVPG-PNz3IWWPTzVbQz9RAr9Z8
	//GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
	import OpenAI from "openai";

	const openai = new OpenAI({
	  apiKey: process.env.GEMINI_API_KEY,
	  baseURL: process.env.GEMINI_BASE_URL
	})
	
  export async function checkConceptDuplicate( questionA: string, referenceQuestions: string[] ): Promise<boolean> {

		  const formattedQuestions = referenceQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
		  const response = await openai.chat.completions.create({
			model: "gemini-1.5-flash", temperature: 0,
			messages: [ {
				role: "system",
				content: `
		You are an agricultural question classifier.

		Determine whether the input question asks the SAME concept as ANY of the candidate questions.

		Important rules:
		- Pest and disease are different.
		- Different crops are different.
		- Yield, variety, fertilizer, irrigation, pest, and disease are different concepts.
		- Only mark true if the questions clearly ask the same problem.

		Respond ONLY with:
		true
		or
		false`}, {
				role: "user", 
				content: `
		Input Question:
		${questionA}

		Candidate Questions:
		${formattedQuestions}

		Does ANY candidate ask the same concept as the input question?
		Return only true or false.`
			  }]})

		  const result = response.choices?.[0]?.message?.content
			?.trim()
			.toLowerCase()

		  return result === "true"
}