import 'reflect-metadata';
import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect, beforeAll} from 'vitest';

import {getFirebaseToken} from '../helpers/firebaseAuth.js';

dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000';

let moderatorTokenG: string;
let questionId: string;
let questionText: string;

beforeAll(async () => {
  moderatorTokenG = await getFirebaseToken(
    process.env.MODERATOR_EMAIL!,
    process.env.MODERATOR_PASSWORD!,
  );
}, 30000);

describe('Question Create E2E', () => {
  it('moderator creates question successfully', async () => {
    const uniqueQuestion = `E2E Question ${Date.now()}`;
    const payload = {
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
    };

    const res = await request(BASE_URL)
      .post('/api/questions')
      .set('Authorization', `Bearer ${moderatorTokenG}`)
      .send(payload);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.question_id).toBeDefined();
    questionText = uniqueQuestion;
    questionId = res.body.question_id;
  });

  it('moderator gets created question by id', async () => {
    const res = await request(BASE_URL)
      .get(`/api/questions/${questionId}/full`)
      .set('Authorization', `Bearer ${moderatorTokenG}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(res.body.data._id).toBe(questionId);

    expect(res.body.data.question).toContain('E2E Question');

    expect(res.body.data.details.state).toBe('Punjab');
    expect(res.body.data.details.district).toBe('Ludhiana');
    expect(res.body.data.details.crop).toBe('Brinjal');

    expect(res.body.data.source).toBe('AGRI_EXPERT');
  });

  it('moderator updates question successfully', async () => {
    const res = await request(BASE_URL)
      .put(`/api/questions/${questionId}`)
      .set('Authorization', `Bearer ${moderatorTokenG}`)
      .send({
        question: 'E2E Updated Question',
        priority: 'high',
        details: {
          state: 'Punjab',
          district: 'Patiala',
          crop: 'Brinjal',
          season: 'Kharif',
          domain: 'Disease Management',
        },
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
  });

  it('question reflects updated values', async () => {
    const res = await request(BASE_URL)
      .get(`/api/questions/${questionId}/full`)
      .set('Authorization', `Bearer ${moderatorTokenG}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);

    expect(res.body.data.question).toBe('E2E Updated Question');

    expect(res.body.data.priority).toBe('high');

    expect(res.body.data.details.state).toBe('Punjab');
    expect(res.body.data.details.district).toBe('Patiala');
    expect(res.body.data.details.crop).toBe('Brinjal');
    expect(res.body.data.details.season).toBe('Kharif');
    expect(res.body.data.details.domain).toBe('Disease Management');
  });

  it('moderator deletes question successfully', async () => {
    const res = await request(BASE_URL)
      .delete(`/api/questions/${questionId}`)
      .set('Authorization', `Bearer ${moderatorTokenG}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);

    expect(res.body.deletedCount).toBe(1);
  });

  it('deleted question is no longer retrievable', async () => {
    const res = await request(BASE_URL)
      .get(`/api/questions/${questionId}/full`)
      .set('Authorization', `Bearer ${moderatorTokenG}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect([400, 404]).toContain(res.status);
  });
});
