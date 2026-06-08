import 'reflect-metadata';
import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect} from 'vitest';

dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000'; // change only if your backend runs on another port

let chemicalId: string;
let chemicalName: string;

describe('Chemical Create E2E', () => {
  it('creates a chemical successfully', async () => {
    const token = process.env.ADMIN_TOKEN;

    expect(token).toBeTruthy();

    const uniqueName = `E2E_Chemical_${Date.now()}`;

    const res = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueName,
        status: 'Restricted',
      });
    chemicalId = res.body.data._id;
    chemicalName = res.body.data.name;

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data.status).toBe('Restricted');
  });
  it('gets created chemical by id', async () => {
    const token = process.env.ADMIN_TOKEN;
    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(chemicalId);
  });

  it('updates a chemical', async () => {
    const token = process.env.ADMIN_TOKEN;

    const updatedName = `${chemicalName}_UPDATED`;

    const res = await request(BASE_URL)
      .put(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: updatedName,
        status: 'Banned',
      });

    console.log('UPDATE STATUS:', res.status);
    console.log('UPDATE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(updatedName);
    expect(res.body.data.status).toBe('Banned');
  });

  it('returns updated chemical after update', async () => {
    const token = process.env.ADMIN_TOKEN;

    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toContain('_UPDATED');
    expect(res.body.data.status).toBe('Banned');
  });

  it('deletes a chemical', async () => {
    const token = process.env.ADMIN_TOKEN;

    const res = await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log('DELETE STATUS:', res.status);
    console.log('DELETE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for deleted chemical', async () => {
    const token = process.env.ADMIN_TOKEN;

    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log('POST DELETE GET STATUS:', res.status);
    console.log('POST DELETE GET BODY:', res.body);

    expect(res.status).toBe(404);
  });
  it('expert cannot create chemical', async () => {
    const token = process.env.EXPERT_TOKEN;

    expect(token).toBeTruthy();

    const res = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E_Expert_${Date.now()}`,
        status: 'Restricted',
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(res.status).toBe(403);
  });
});
