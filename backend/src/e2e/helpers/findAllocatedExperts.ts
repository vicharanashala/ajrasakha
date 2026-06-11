import request from 'supertest';
import * as dotenv from 'dotenv';
dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000';

export async function findAllocatedExperts(
  questionId: string,
  expertTokens: Map<string, string>,
) {
  const allocatedExperts: string[] = [];

  for (const [email, token] of expertTokens.entries()) {
    const allocatedRes = await request(BASE_URL)
      .post('/api/questions/allocated')
      .set('Authorization', `Bearer ${token}`)
      .query({
        page: 1,
        limit: 100,
        review_level: 'Author',
      })
      .send({});

    const questions = allocatedRes.body;

    const found = questions.find((question: any) => question.id === questionId);

    if (found) {
      allocatedExperts.push(email);
    }
  }

  return allocatedExperts;
}
