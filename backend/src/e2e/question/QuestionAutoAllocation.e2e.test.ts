import 'reflect-metadata';
import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect, beforeAll} from 'vitest';

import {getFirebaseToken} from '../helpers/firebaseAuth.js';
import {findAllocatedExperts} from '../helpers/findAllocatedExperts.js';

dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000';

let moderatorTokenG: string;

const expertEmails = [
  'experttest1@annam.ai',
  'experttest2@annam.ai',
  'experttest3@annam.ai',
  'experttest4@annam.ai',
  'experttest5@annam.ai',
  'experttest6@annam.ai',
  'experttest7@annam.ai',
  'experttest8@annam.ai',
];

const expertTokens = new Map<string, string>();

beforeAll(async () => {
  moderatorTokenG = await getFirebaseToken(
    process.env.MODERATOR_EMAIL!,
    process.env.MODERATOR_PASSWORD!,
  );

  for (const email of expertEmails) {
    const token = await getFirebaseToken(email, process.env.EXPERT_PASSWORD!);

    expertTokens.set(email, token);
  }
}, 60000);

async function waitFor(
  assertion: () => Promise<void>,
  options?: {
    timeout?: number;
    interval?: number;
  },
) {
  const timeout = options?.timeout ?? 20000;
  const interval = options?.interval ?? 1000;

  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  await assertion();
}

describe('Question Auto Allocation E2E', () => {
  it('automatically allocates AGRI_EXPERT question to exactly one expert', async () => {
    const uniqueQuestion = `Auto Allocation ${Date.now()}`;

    const createRes = await request(BASE_URL)
      .post('/api/questions')
      .set('Authorization', `Bearer ${moderatorTokenG}`)
      .send({
        question: uniqueQuestion,
        priority: 'medium',
        source: 'AGRI_EXPERT',
        details: {
          state: 'Punjab',
          district: 'Ludhiana',
          crop: 'Brinjal',
          season: 'Rabi',
          domain: 'Crop Protection',
        },
      });

    console.log('CREATE RESPONSE:', JSON.stringify(createRes.body, null, 2));

    expect(createRes.status).toBe(201);

    const questionId = createRes.body.question_id;

    expect(questionId).toBeDefined();

    await waitFor(
      async () => {
        const matchedExperts: string[] = [];

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

          console.log(email, JSON.stringify(allocatedRes.body, null, 2));

          expect(allocatedRes.status).toBe(200);

          const questions = allocatedRes.body;

          const found = questions.find(
            (question: any) => question.id === questionId,
          );

          if (found) {
            matchedExperts.push(email);
          }
        }

        console.log(
          'MATCHED EXPERTS:',
          JSON.stringify(matchedExperts, null, 2),
        );

        expect(matchedExperts.length).toBe(1);
      },
      {
        timeout: 30000,
        interval: 1000,
      },
    );
  }, 45000);
  it('allocates question to highest scoring expert', async () => {
    const uniqueQuestion = `Allocation Score Test ${Date.now()}`;

    const createRes = await request(BASE_URL)
      .post('/api/questions')
      .set('Authorization', `Bearer ${moderatorTokenG}`)
      .send({
        question: uniqueQuestion,
        priority: 'medium',
        source: 'AGRI_EXPERT',
        details: {
          state: 'Punjab',
          district: 'Ludhiana',
          crop: 'Brinjal',
          season: 'Rabi',
          domain: 'Crop Protection',
        },
      });

    expect(createRes.status).toBe(201);

    const questionId = createRes.body.question_id;

    await waitFor(
      async () => {
        const allocatedExperts = await findAllocatedExperts(
          questionId,
          expertTokens,
        );

        expect(allocatedExperts.length).toBe(1);

        expect(allocatedExperts[0]).toBe('experttest1@annam.ai');
      },
      {
        timeout: 30000,
        interval: 1000,
      },
    );
  }, 45000);
});
