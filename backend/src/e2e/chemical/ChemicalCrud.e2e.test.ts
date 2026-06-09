import 'reflect-metadata';
import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect, beforeAll} from 'vitest';
import {getFirebaseToken} from '../helpers/firebaseAuth.js';
dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000'; // change only if your backend runs on another port

let chemicalId: string;
let chemicalName: string;

let adminTokenG: string;
let moderatorTokenG: string;
let expertTokenG: string;

beforeAll(async () => {
  adminTokenG = await getFirebaseToken(
    process.env.ADMIN_EMAIL!,
    process.env.ADMIN_PASSWORD!,
  );

  moderatorTokenG = await getFirebaseToken(
    process.env.MODERATOR_EMAIL!,
    process.env.MODERATOR_PASSWORD!,
  );

  expertTokenG = await getFirebaseToken(
    process.env.EXPERT_EMAIL!,
    process.env.EXPERT_PASSWORD!,
  );

  console.log('Tokens generated successfully');
}, 30000);

describe('Authentication Smoke Tests', () => {
  it('returns 401 when token is missing', async () => {
    const res = await request(BASE_URL).get('/api/chemicals');

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(BASE_URL)
      .get('/api/chemicals')
      .set('Authorization', 'Bearer invalid-token');

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(401);
  });

  it('returns 200 when token is valid', async () => {
    const res = await request(BASE_URL)
      .get('/api/chemicals')
      .set('Authorization', `Bearer ${adminTokenG}`);

    console.log('STATUS:', res.status);

    expect(res.status).toBe(200);
  });
});

describe('Chemical CRUD E2E', () => {
  it('admin creates a chemical successfully', async () => {
    const token = adminTokenG;

    expect(token).toBeTruthy();

    const uniqueName = `E2E_Create_Chemical_Admin_${Date.now()}`;

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
  it('admin gets created chemical by id', async () => {
    const token = adminTokenG;
    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(chemicalId);
  });

  it('admin updates a chemical', async () => {
    const token = adminTokenG;

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

  it('admin gets chemical after update', async () => {
    const token = adminTokenG;

    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toContain('_UPDATED');
    expect(res.body.data.status).toBe('Banned');
  });

  it('admin deletes a chemical', async () => {
    const token = adminTokenG;

    const res = await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log('DELETE STATUS:', res.status);
    console.log('DELETE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin gets 404 for deleted chemical', async () => {
    const token = adminTokenG;

    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log('POST DELETE GET STATUS:', res.status);
    console.log('POST DELETE GET BODY:', res.body);

    expect(res.status).toBe(404);
  });
  it('expert cannot create chemical', async () => {
    const token = expertTokenG;

    expect(token).toBeTruthy();

    const res = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E_Create_Chemical_Expert_${Date.now()}`,
        status: 'Restricted',
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(res.status).toBe(403);
  });

  it('expert cannot update a chemical', async () => {
    const token = expertTokenG;

    const updatedName = `${chemicalName}_UPDATED`;

    const res = await request(BASE_URL)
      .put(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: updatedName,
        status: 'Banned',
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(403);
  });

  it('moderator creates chemical', async () => {
    const token = moderatorTokenG;

    expect(token).toBeTruthy();
    const uniqueName = `E2E_Create_Chemical_Moderator_${Date.now()}`;

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
    console.log('BODY:', res.body);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data.status).toBe('Restricted');
  });

  it('moderator can update chemical', async () => {
    const adminToken = adminTokenG;
    const moderatorToken = moderatorTokenG;

    expect(adminToken).toBeTruthy();
    expect(moderatorToken).toBeTruthy();

    // Create chemical as admin
    const createRes = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E_Moderator_Updated_${Date.now()}`,
        status: 'Restricted',
      });

    expect(createRes.status).toBe(201);

    const chemicalId = createRes.body.data._id;

    // Update as moderator
    const updateRes = await request(BASE_URL)
      .put(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        name: 'Updated_By_Moderator',
        status: 'Banned',
      });

    console.log('UPDATE STATUS:', updateRes.status);
    console.log('UPDATE BODY:', updateRes.body);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);

    // Verify persisted
    const getRes = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Updated_By_Moderator');
    expect(getRes.body.data.status).toBe('Banned');

    // Cleanup
    await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('expert cannot delete chemical', async () => {
    const adminToken = adminTokenG;
    const expertToken = expertTokenG;

    expect(adminToken).toBeTruthy();
    expect(expertToken).toBeTruthy();

    // Create chemical as admin
    const createRes = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E_Delete_${Date.now()}`,
        status: 'Restricted',
      });

    expect(createRes.status).toBe(201);

    const chemicalId = createRes.body.data._id;

    // Expert attempts delete
    const deleteRes = await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${expertToken}`);

    console.log('DELETE STATUS:', deleteRes.status);
    console.log('DELETE BODY:', deleteRes.body);

    expect(deleteRes.status).toBe(403);

    // Verify chemical still exists
    const getRes = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);

    // Cleanup
    await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('moderator can delete chemical', async () => {
    const adminToken = adminTokenG;
    const moderatorToken = moderatorTokenG;

    expect(adminToken).toBeTruthy();
    expect(moderatorToken).toBeTruthy();

    // Create as admin
    const createRes = await request(BASE_URL)
      .post('/api/chemicals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E_Mod_Delete_${Date.now()}`,
        status: 'Restricted',
      });

    expect(createRes.status).toBe(201);

    const chemicalId = createRes.body.data._id;

    // Delete as moderator
    const deleteRes = await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${moderatorToken}`);

    console.log('DELETE STATUS:', deleteRes.status);
    console.log('DELETE BODY:', deleteRes.body);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify deletion
    const getRes = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(404);
  });
});
