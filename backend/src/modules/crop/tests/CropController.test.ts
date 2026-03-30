import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {useExpressServer, useContainer} from 'routing-controllers';
import {Container} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {describe, it, expect, beforeAll, vi} from 'vitest';
import {HttpErrorHandler} from '#shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {ICrop} from '#root/shared/interfaces/models.js';
import {CropController} from '../controllers/CropController.js';

// ── Shared mock data ──────────────────────────────────────────────────────────

const adminUser = {
  _id: '664f000000000000000000001',
  role: 'admin',
  firebaseUID: 'firebase-admin-uid',
  email: 'admin@test.com',
  firstName: 'Admin',
  status: 'active',
  isBlocked: false,
};

const expertUser = {...adminUser, _id: '664f000000000000000000002', role: 'expert'};

const mockCrop: ICrop = {
  _id: '664f1a2b3c4d5e6f7a8b9c0d',
  name: 'Rice',
  aliases: ['Paddy'],
  createdBy: adminUser._id,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ── Mock service ──────────────────────────────────────────────────────────────

const mockCropService = {
  getAllCrops: vi.fn().mockResolvedValue({crops: [mockCrop], totalCount: 1, totalPages: 1}),
  getCropById: vi.fn().mockResolvedValue(mockCrop),
  createCrop: vi.fn().mockResolvedValue(mockCrop),
  updateCrop: vi.fn().mockResolvedValue(mockCrop),
  deleteCrop: vi.fn().mockResolvedValue({modifiedCount: 1}),
};

// ── App setup ─────────────────────────────────────────────────────────────────

describe('CropController', () => {
  let app: any;

  beforeAll(() => {
    const container = new Container();
    container.bind(CropController).toSelf().inSingletonScope();
    container.bind(GLOBAL_TYPES.CropService).toConstantValue(mockCropService);
    container.bind(HttpErrorHandler).toSelf().inSingletonScope();

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(Express(), {
      controllers: [CropController],
      middlewares: [HttpErrorHandler],
      defaultErrorHandler: false,
      validation: true,
      authorizationChecker: async () => true,
      currentUserChecker: async (action) => {
        // Inject admin or expert based on test header
        const role = action.request.headers['x-test-role'];
        return role === 'expert' ? expertUser : adminUser;
      },
    });
  });

  // ── GET /crops ──────────────────────────────────────────────────────────────

  describe('GET /crops', () => {
    it('returns 200 with crop list', async () => {
      const res = await request(app).get('/crops');
      expect(res.status).toBe(200);
      expect(res.body.crops).toHaveLength(1);
      expect(res.body.crops[0].name).toBe('Rice');
    });

    it('passes query params to service', async () => {
      await request(app).get('/crops?search=rice&page=1&limit=10');
      expect(mockCropService.getAllCrops).toHaveBeenCalledWith(
        expect.objectContaining({search: 'rice'}),
      );
    });
  });

  // ── GET /crops/:cropId ───────────────────────────────────────────────────────

  describe('GET /crops/:cropId', () => {
    it('returns 200 with crop data', async () => {
      const res = await request(app).get('/crops/664f1a2b3c4d5e6f7a8b9c0d');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Rice');
    });

    it('returns 404 when crop not found', async () => {
      mockCropService.getCropById.mockResolvedValueOnce(null);
      const res = await request(app).get('/crops/664f1a2b3c4d5e6f7a8b9c0d');
      expect(res.status).toBe(404);
    });
  });

  // ── POST /crops ──────────────────────────────────────────────────────────────

  describe('POST /crops', () => {
    const validBody = {name: 'Wheat', aliases: ['Gehun']};

    it('admin can create a crop → 201', async () => {
      const res = await request(app).post('/crops').send(validBody);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('expert gets 403', async () => {
      const res = await request(app)
        .post('/crops')
        .set('x-test-role', 'expert')
        .send(validBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(app).post('/crops').send({});
      expect(res.status).toBe(400);
    });
  });

  // ── PUT /crops/:cropId ───────────────────────────────────────────────────────

  describe('PUT /crops/:cropId', () => {
    it('admin can update a crop → 200', async () => {
      const res = await request(app)
        .put('/crops/664f1a2b3c4d5e6f7a8b9c0d')
        .send({aliases: ['Paddy', 'ধান']});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('expert gets 403', async () => {
      const res = await request(app)
        .put('/crops/664f1a2b3c4d5e6f7a8b9c0d')
        .set('x-test-role', 'expert')
        .send({name: 'Basmati Rice'});
      expect(res.status).toBe(403);
    });

    it('returns 404 when crop not found', async () => {
      mockCropService.updateCrop.mockResolvedValueOnce(null);
      const res = await request(app)
        .put('/crops/664f1a2b3c4d5e6f7a8b9c0d')
        .send({name: 'Updated'});
      expect(res.status).toBe(404);
    });
  });
});

