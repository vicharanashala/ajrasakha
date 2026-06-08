import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {useExpressServer, useContainer} from 'routing-controllers';
import {Container} from 'inversify';
import {describe, it, expect, beforeAll, vi, beforeEach} from 'vitest';

import {InversifyAdapter} from '#root/inversify-adapter.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {HttpErrorHandler} from '#shared/index.js';

import {ChemicalController} from '../controllers/ChemicalController.js';
import {IChemical} from '#root/shared/interfaces/models.js';

// ─────────────────────────────────────────────────────────────
// Mock Users
// ─────────────────────────────────────────────────────────────

const adminUser = {
  _id: '664f000000000000000000001',
  role: 'admin',
  firebaseUID: 'firebase-admin-uid',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  status: 'active',
  isBlocked: false,
};

const moderatorUser = {
  ...adminUser,
  _id: '664f000000000000000000002',
  role: 'moderator',
};

const expertUser = {
  ...adminUser,
  _id: '664f000000000000000000003',
  role: 'expert',
};

// ─────────────────────────────────────────────────────────────
// Mock Chemical
// ─────────────────────────────────────────────────────────────

const mockChemical: IChemical = {
  _id: '664f1a2b3c4d5e6f7a8b9c0d',
  name: 'Urea',
  status: 'Restricted',
  //   crops: ['Rice'],
  createdBy: adminUser._id,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ─────────────────────────────────────────────────────────────
// Mock Service
// ─────────────────────────────────────────────────────────────

const mockChemicalService = {
  getAllChemicals: vi.fn().mockResolvedValue({
    chemicals: [mockChemical],
    totalCount: 1,
    totalPages: 1,
  }),

  getChemicalById: vi.fn().mockResolvedValue(mockChemical),

  createChemical: vi.fn().mockResolvedValue(mockChemical),

  updateChemical: vi.fn().mockResolvedValue(mockChemical),

  deleteChemical: vi.fn().mockResolvedValue(true),
};

// ─────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────

describe('ChemicalController', () => {
  let app: any;

  beforeAll(() => {
    const container = new Container();

    container.bind(ChemicalController).toSelf().inSingletonScope();

    container
      .bind(GLOBAL_TYPES.ChemicalService)
      .toConstantValue(mockChemicalService);

    container.bind(HttpErrorHandler).toSelf().inSingletonScope();

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(Express(), {
      controllers: [ChemicalController],
      middlewares: [HttpErrorHandler],
      defaultErrorHandler: false,
      validation: true,

      authorizationChecker: async () => true,

      currentUserChecker: async action => {
        const role = action.request.headers['x-test-role'];

        if (role === 'moderator') {
          return moderatorUser;
        }

        if (role === 'expert') {
          return expertUser;
        }

        return adminUser;
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockChemicalService.getAllChemicals.mockResolvedValue({
      chemicals: [mockChemical],
      totalCount: 1,
      totalPages: 1,
    });

    mockChemicalService.getChemicalById.mockResolvedValue(mockChemical);
    mockChemicalService.createChemical.mockResolvedValue(mockChemical);
    mockChemicalService.updateChemical.mockResolvedValue(mockChemical);
    mockChemicalService.deleteChemical.mockResolvedValue(true);
  });

  // ───────────────────────────────────────────────────────────
  // GET /chemicals
  // ───────────────────────────────────────────────────────────

  describe('GET /chemicals', () => {
    it('returns 200 with chemical list', async () => {
      const res = await request(app).get('/chemicals');

      expect(res.status).toBe(200);
      expect(res.body.chemicals).toHaveLength(1);
      expect(res.body.chemicals[0].name).toBe('Urea');
    });

    it('passes query params to service', async () => {
      await request(app).get('/chemicals?search=urea&page=1&limit=10');

      expect(mockChemicalService.getAllChemicals).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'urea',
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────
  // GET /chemicals/:chemicalId
  // ───────────────────────────────────────────────────────────

  describe('GET /chemicals/:chemicalId', () => {
    it('returns 200 with chemical data', async () => {
      const res = await request(app).get('/chemicals/664f1a2b3c4d5e6f7a8b9c0d');

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Urea');
    });

    it('returns 404 when chemical not found', async () => {
      mockChemicalService.getChemicalById.mockResolvedValueOnce(null);

      const res = await request(app).get('/chemicals/664f1a2b3c4d5e6f7a8b9c0d');

      expect(res.status).toBe(404);
    });
  });

  // ───────────────────────────────────────────────────────────
  // POST /chemicals
  // ───────────────────────────────────────────────────────────

  describe('POST /chemicals', () => {
    const validBody = {
      name: 'DAP',
      status: 'Restricted',
      crops: ['Rice'],
    };

    it('admin can create chemical → 201', async () => {
      const res = await request(app).post('/chemicals').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      expect(mockChemicalService.createChemical).toHaveBeenCalled();
    });

    it('moderator can create chemical → 201', async () => {
      const res = await request(app)
        .post('/chemicals')
        .set('x-test-role', 'moderator')
        .send(validBody);

      expect(res.status).toBe(201);
    });

    it('expert gets 403', async () => {
      const res = await request(app)
        .post('/chemicals')
        .set('x-test-role', 'expert')
        .send(validBody);

      console.log('res.body:-----------------------------------');
      console.log(JSON.stringify(res.body, null, 2));

      expect(res.status).toBe(403);
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(app).post('/chemicals').send({});

      expect(res.status).toBe(400);
    });
  });

  // ───────────────────────────────────────────────────────────
  // PUT /chemicals/:chemicalId
  // ───────────────────────────────────────────────────────────

  describe('PUT /chemicals/:chemicalId', () => {
    it('admin can update chemical → 200', async () => {
      const res = await request(app)
        .put('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .send({
          name: 'Updated Urea',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('moderator can update chemical → 200', async () => {
      const res = await request(app)
        .put('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .set('x-test-role', 'moderator')
        .send({
          name: 'Updated Urea',
        });

      expect(res.status).toBe(200);
    });

    it('expert gets 403', async () => {
      const res = await request(app)
        .put('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .set('x-test-role', 'expert')
        .send({
          name: 'Updated Urea',
        });

      expect(res.status).toBe(403);
    });

    it('returns 404 when chemical not found', async () => {
      mockChemicalService.updateChemical.mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .send({
          name: 'Updated Urea',
        });

      expect(res.status).toBe(404);
    });
  });

  // ───────────────────────────────────────────────────────────
  // DELETE /chemicals/:chemicalId
  // ───────────────────────────────────────────────────────────

  describe('DELETE /chemicals/:chemicalId', () => {
    it('admin can delete chemical → 200', async () => {
      const res = await request(app).delete(
        '/chemicals/664f1a2b3c4d5e6f7a8b9c0d',
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('moderator can delete chemical → 200', async () => {
      const res = await request(app)
        .delete('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .set('x-test-role', 'moderator');

      expect(res.status).toBe(200);
    });

    it('expert gets 403', async () => {
      const res = await request(app)
        .delete('/chemicals/664f1a2b3c4d5e6f7a8b9c0d')
        .set('x-test-role', 'expert');

      expect(res.status).toBe(403);
    });

    it('returns 404 when chemical not found', async () => {
      mockChemicalService.deleteChemical.mockResolvedValueOnce(false);

      const res = await request(app).delete(
        '/chemicals/664f1a2b3c4d5e6f7a8b9c0d',
      );

      expect(res.status).toBe(404);
    });
  });
});
