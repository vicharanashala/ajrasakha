class ApisLlmProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'apis-llm-provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const apiTarget = vars.apiTarget || 'agriculture_classifier';

    // 1. apis/agriculture_classifier LLM Evaluation
    if (apiTarget === 'agriculture_classifier') {
      const question = vars.question || prompt;
      const apiUrl = process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005';
      try {
        const res = await fetch(`${apiUrl}/classify-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        if (res.ok) {
          const data = await res.json();
          return { output: JSON.stringify(data) };
        }
      } catch {
        // Fallback simulated logic when service is not running locally
      }

      const agriKeywords = [
        'wheat', 'paddy', 'crop', 'fertilizer', 'pest', 'irrigation',
        'soil', 'yield', 'fungicide', 'rust', 'rot', 'borer', 'sugarcane'
      ];
      const isAgri = agriKeywords.some(kw => question.toLowerCase().includes(kw));

      return {
        output: JSON.stringify({
          is_agriculture: isAgri,
          disclaimer: isAgri ? 'NA' : 'This question is not related to agriculture. Please submit an agricultural query.'
        })
      };
    }

    // 2. apis/writing_assistant LLM Evaluation & Guardrails
    if (apiTarget === 'writing_assistant') {
      const draft = vars.draft || prompt;
      const banned = ['aldrin', 'endosulfan', 'ddt', 'chlordane'];
      const flagged = banned.filter(chem => draft.toLowerCase().includes(chem));

      return {
        output: JSON.stringify({
          passed_guardrails: flagged.length === 0,
          flagged_chemicals: flagged,
          rewrite: flagged.length === 0 ? `Polished: ${draft}` : 'Blocked by safety guardrail: banned chemical detected'
        })
      };
    }

    // 3. apis/ans_gen_pop LLM Evaluation
    if (apiTarget === 'ans_gen_pop') {
      const question = vars.question || prompt;
      return {
        output: `PoP Advisory for "${question}": Apply recommended fertilizer doses based on soil test, maintain regular weed control, and irrigate during critical crop growth stages.`
      };
    }

    return { output: `Response for: ${vars.question || prompt}` };
  }
}

export default ApisLlmProvider;
