
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  shouldShowDisclaimer,
  getDisclaimer,
} from '../services/disclaimerService';

const baseURL = 'http://localhost:3001';

async function createQuestion(
  request: APIRequestContext,
  question = 'What is soil testing?',
  language = 'English'
) {
  const response = await request.post(`${baseURL}/api/questions`, {
    data: { question, language },
  });

  expect(response.status()).toBe(201);
  return await response.json();
}

async function createAnswer(
  request: APIRequestContext,
  questionId: string,
  answer = 'Farmers should test soil regularly.',
  language = 'English',
  disclaimerShown = false
) {
  const response = await request.post(`${baseURL}/api/answers`, {
    data: { questionId, answer, language, disclaimerShown },
  });

  expect(response.status()).toBe(201);
  return await response.json();
}

test.describe('MongoDB Question and Answer API - 46 Tests', () => {

  // QUESTION CREATION TESTS (1–10)

  test('1. Save an English question', async ({ request }) => {
    const q = await createQuestion(request, 'What is irrigation?', 'English');
    expect(q.language).toBe('English');
  });

  test('2. Save a Hindi question', async ({ request }) => {
    const q = await createQuestion(request, 'सिंचाई क्या है?', 'Hindi');
    expect(q.language).toBe('Hindi');
  });

  test('3. Save a Marathi question', async ({ request }) => {
    const q = await createQuestion(request, 'माती परीक्षण म्हणजे काय?', 'Marathi');
    expect(q.language).toBe('Marathi');
  });

  test('4. Save a Bengali question', async ({ request }) => {
    const q = await createQuestion(request, 'মাটি পরীক্ষা কী?', 'Bengali');
    expect(q.language).toBe('Bengali');
  });

  test('5. Save a Tamil question', async ({ request }) => {
    const q = await createQuestion(request, 'மண் பரிசோதனை என்றால் என்ன?', 'Tamil');
    expect(q.language).toBe('Tamil');
  });

  test('6. Save a Telugu question', async ({ request }) => {
    const q = await createQuestion(request, 'నేల పరీక్ష అంటే ఏమిటి?', 'Telugu');
    expect(q.language).toBe('Telugu');
  });

  test('7. Generate a MongoDB ID for a question', async ({ request }) => {
    const q = await createQuestion(request);
    expect(q._id).toBeTruthy();
  });

  test('8. Save the correct question text', async ({ request }) => {
    const text = 'How can farmers improve crop yield?';
    const q = await createQuestion(request, text);
    expect(q.question).toBe(text);
  });

  test('9. Save a question creation timestamp', async ({ request }) => {
    const q = await createQuestion(request);
    expect(q.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(q.createdAt))).toBe(false);
  });

  test('10. Generate unique IDs for different questions', async ({ request }) => {
    const q1 = await createQuestion(request, 'Question one');
    const q2 = await createQuestion(request, 'Question two');
    expect(q1._id).not.toBe(q2._id);
  });


  // QUESTION VALIDATION TESTS (11–16)

  test('11. Reject a question with missing question text', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('12. Reject a question with missing language', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { question: 'What is farming?' },
    });
    expect(response.status()).toBe(400);
  });

  test('13. Reject an empty question', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { question: '', language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('14. Reject an empty language', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { question: 'What is farming?', language: '' },
    });
    expect(response.status()).toBe(400);
  });

  test('15. Reject a null question', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { question: null, language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('16. Reject a null language', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/questions`, {
      data: { question: 'What is farming?', language: null },
    });
    expect(response.status()).toBe(400);
  });


  // ANSWER CREATION TESTS (17–26)

  test('17. Save an answer linked to a question', async ({ request }) => {
    const q = await createQuestion(request);
    const a = await createAnswer(request, q._id);
    expect(String(a.questionId)).toBe(q._id);
  });

  test('18. Save an English answer', async ({ request }) => {
    const q = await createQuestion(request);
    const a = await createAnswer(request, q._id, 'Use organic compost.', 'English');
    expect(a.language).toBe('English');
  });

  test('19. Save a Hindi answer', async ({ request }) => {
    const q = await createQuestion(request, 'मिट्टी की जांच कैसे करें?', 'Hindi');
    const a = await createAnswer(request, q._id, 'मिट्टी की जांच कराएं।', 'Hindi');
    expect(a.language).toBe('Hindi');
  });

  test('20. Save a Marathi answer', async ({ request }) => {
    const q = await createQuestion(request, 'पिकांना पाणी कधी द्यावे?', 'Marathi');
    const a = await createAnswer(request, q._id, 'गरजेनुसार पाणी द्या.', 'Marathi');
    expect(a.language).toBe('Marathi');
  });

  test('21. Save a Bengali answer', async ({ request }) => {
    const q = await createQuestion(request, 'ধানের যত্ন কীভাবে নেব?', 'Bengali');
    const a = await createAnswer(request, q._id, 'নিয়মিত ফসলের যত্ন নিন।', 'Bengali');
    expect(a.language).toBe('Bengali');
  });

  test('22. Save a Tamil answer', async ({ request }) => {
    const q = await createQuestion(request, 'பயிர்களுக்கு நீர் எப்போது?', 'Tamil');
    const a = await createAnswer(request, q._id, 'தேவைக்கேற்ப நீர் பாய்ச்சவும்.', 'Tamil');
    expect(a.language).toBe('Tamil');
  });

  test('23. Save a Telugu answer', async ({ request }) => {
    const q = await createQuestion(request, 'పంటకు నీరు ఎప్పుడు ఇవ్వాలి?', 'Telugu');
    const a = await createAnswer(request, q._id, 'అవసరానికి అనుగుణంగా నీరు ఇవ్వండి.', 'Telugu');
    expect(a.language).toBe('Telugu');
  });

  test('24. Save the answer text correctly', async ({ request }) => {
    const q = await createQuestion(request);
    const text = 'Use compost to improve soil fertility.';
    const a = await createAnswer(request, q._id, text);
    expect(a.answer).toBe(text);
  });

  test('25. Default disclaimerShown to false', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: {
        questionId: q._id,
        answer: 'Use organic manure.',
        language: 'English',
      },
    });

    expect(response.status()).toBe(201);
    const a = await response.json();
    expect(a.disclaimerShown).toBe(false);
  });

  test('26. Save disclaimerShown as true when provided', async ({ request }) => {
    const q = await createQuestion(request);
    const a = await createAnswer(
      request, q._id, 'Please consult an expert.', 'English', true
    );
    expect(a.disclaimerShown).toBe(true);
  });


  // ANSWER VALIDATION TESTS (27–33)

  test('27. Reject an answer with missing questionId', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { answer: 'Use compost.', language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('28. Reject an answer with missing answer text', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('29. Reject an answer with missing language', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, answer: 'Use compost.' },
    });
    expect(response.status()).toBe(400);
  });

  test('30. Reject an empty answer', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, answer: '', language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('31. Reject an empty answer language', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, answer: 'Use compost.', language: '' },
    });
    expect(response.status()).toBe(400);
  });

  test('32. Reject a null answer', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, answer: null, language: 'English' },
    });
    expect(response.status()).toBe(400);
  });

  test('33. Reject a null answer language', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.post(`${baseURL}/api/answers`, {
      data: { questionId: q._id, answer: 'Use compost.', language: null },
    });
    expect(response.status()).toBe(400);
  });


  // ANSWER RETRIEVAL TESTS (34–40)

  test('34. Retrieve a saved answer', async ({ request }) => {
    const q = await createQuestion(request);
    const text = 'Test the soil before planting.';
    await createAnswer(request, q._id, text);

    const response = await request.get(`${baseURL}/api/answers/${q._id}`);
    expect(response.status()).toBe(200);

    const a = await response.json();
    expect(a.answer).toBe(text);
  });

  test('35. Return 404 when the question does not exist', async ({ request }) => {
    const response = await request.get(
      `${baseURL}/api/answers/000000000000000000000001`
    );
    expect(response.status()).toBe(404);
  });

  test('36. Return 202 when an answer is not available yet', async ({ request }) => {
    const q = await createQuestion(request);
    const response = await request.get(`${baseURL}/api/answers/${q._id}`);

    expect(response.status()).toBe(202);
    const result = await response.json();
    expect(result.disclaimerShown).toBe(false);
  });

  test('37. Retrieve the correct answer for separate questions', async ({ request }) => {
    const q1 = await createQuestion(request, 'Question about wheat');
    const q2 = await createQuestion(request, 'Question about rice');

    await createAnswer(request, q1._id, 'Wheat answer');
    await createAnswer(request, q2._id, 'Rice answer');

    const response = await request.get(`${baseURL}/api/answers/${q2._id}`);
    const result = await response.json();

    expect(response.status()).toBe(200);
    expect(result.answer).toBe('Rice answer');
  });

  test('38. Preserve answer language during retrieval', async ({ request }) => {
    const q = await createQuestion(request, 'सिंचाई क्या है?', 'Hindi');
    await createAnswer(request, q._id, 'सिंचाई में पानी दिया जाता है।', 'Hindi');

    const response = await request.get(`${baseURL}/api/answers/${q._id}`);
    const result = await response.json();

    expect(result.language).toBe('Hindi');
  });

  test('39. Preserve disclaimer status during retrieval', async ({ request }) => {
    const q = await createQuestion(request);
    await createAnswer(request, q._id, 'Consult an expert.', 'English', true);

    const response = await request.get(`${baseURL}/api/answers/${q._id}`);
    const result = await response.json();

    expect(result.disclaimerShown).toBe(true);
  });

  test('40. Return the correct question ID with the retrieved answer', async ({ request }) => {
    const q = await createQuestion(request);
    await createAnswer(request, q._id, 'Use balanced fertilizer.');

    const response = await request.get(`${baseURL}/api/answers/${q._id}`);
    const result = await response.json();

    expect(String(result.questionId)).toBe(q._id);
  });


  // TWO-HOUR DISCLAIMER TESTS (41–46)

  test('41. Do not show disclaimer before two hours', () => {
    const questionTime = new Date(Date.now() - 119 * 60 * 1000);
    expect(shouldShowDisclaimer(questionTime)).toBe(false);
  });

  test('42. Show disclaimer exactly after two hours', () => {
    const questionTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(shouldShowDisclaimer(questionTime)).toBe(true);
  });

  test('43. Show disclaimer after more than two hours', () => {
    const questionTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(shouldShowDisclaimer(questionTime)).toBe(true);
  });

  test('44. Do not show disclaimer for a future question', () => {
    const questionTime = new Date(Date.now() + 60 * 60 * 1000);
    expect(shouldShowDisclaimer(questionTime)).toBe(false);
  });

  test('45. Return disclaimer in Hindi', () => {
    const disclaimer = getDisclaimer('Hindi');
    expect(disclaimer).toContain('कृपया कृषि विशेषज्ञ से सलाह लें');
  });

  test('46. Return disclaimer in English', () => {
    const disclaimer = getDisclaimer('English');
    expect(disclaimer).toContain('agricultural expert');
  });

});
