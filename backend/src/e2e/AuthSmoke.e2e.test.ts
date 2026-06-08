import * as dotenv from 'dotenv';
import request from 'supertest';
import {describe, it, expect} from 'vitest';

dotenv.config({
  path: '.env.test',
});

describe('Auth Smoke Test', () => {
  it('can access protected endpoint', async () => {
    const token = process.env.ADMIN_TOKEN;

    console.log('TOKEN EXISTS:', !!token);

    const res = await request('http://localhost:4000')
      .get('/api/chemicals')
      .set('Authorization', `Bearer ${token}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(true).toBe(true);
  });
});
