import 'reflect-metadata';
import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect} from 'vitest';

dotenv.config({path: '.env.test'});

const BASE_URL = 'http://localhost:4000'; // change only if your backend runs on another port

let chemicalId: string;
let chemicalName: string;

describe('Chemical Create E2E', () => {
  it('admin creates a chemical successfully', async () => {
    const token = process.env.ADMIN_TOKEN;

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
    const token = process.env.ADMIN_TOKEN;
    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(chemicalId);
  });

  it('admin updates a chemical', async () => {
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

  it('admin gets chemical after update', async () => {
    const token = process.env.ADMIN_TOKEN;

    const res = await request(BASE_URL)
      .get(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toContain('_UPDATED');
    expect(res.body.data.status).toBe('Banned');
  });

  it('admin deletes a chemical', async () => {
    const token = process.env.ADMIN_TOKEN;

    const res = await request(BASE_URL)
      .delete(`/api/chemicals/${chemicalId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log('DELETE STATUS:', res.status);
    console.log('DELETE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin gets 404 for deleted chemical', async () => {
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
        name: `E2E_Create_Chemical_Expert_${Date.now()}`,
        status: 'Restricted',
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(res.status).toBe(403);
  });

  it('expert cannot update a chemical', async () => {
    const token = process.env.EXPERT_TOKEN;

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
    const token = process.env.MODERATOR_TOKEN;

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
    const adminToken = process.env.ADMIN_TOKEN;
    const moderatorToken = process.env.MODERATOR_TOKEN;

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
    const adminToken = process.env.ADMIN_TOKEN;
    const expertToken = process.env.EXPERT_TOKEN;

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
    const adminToken = process.env.ADMIN_TOKEN;
    const moderatorToken = process.env.MODERATOR_TOKEN;

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
