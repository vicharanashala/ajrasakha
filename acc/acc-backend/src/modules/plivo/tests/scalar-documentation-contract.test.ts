import 'reflect-metadata';
import {describe, expect, it, vi} from 'vitest';
import {PlivoController} from '#root/modules/plivo/controllers/PlivoController.js';
import {generateOpenAPISpec} from '#shared/functions/generateOpenApiSpec.js';

vi.mock('plivo', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({calls: {list: vi.fn()}})),
  },
}));
vi.mock('#root/config/app.js', () => ({
  appConfig: {
    module: 'all',
    isDevelopment: true,
    isStaging: false,
    isProduction: false,
    port: 4001,
    url: 'http://localhost:4001',
  },
}));

describe('ACC Scalar Documentation Contract', () => {
  const createSpec = () => generateOpenAPISpec({
    controllers: [PlivoController],
    routePrefix: '/api',
  }, []);

  it('identifies the standalone ACC API', () => {
    const spec = createSpec();

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info).toMatchObject({
      title: 'Annam Call Center (ACC) API Documentation',
      version: '1.0.0',
    });
  });

  it('documents the Plivo answer and call-ended webhook operations', () => {
    const spec = createSpec();
    const paths = Object.keys(spec.paths);

    expect(paths.some(path => path.endsWith('/plivo/answer'))).toBe(true);
    expect(paths.some(path => path.endsWith('/plivo/webhook/call-ended')))
      .toBe(true);
  });

  it('groups Plivo endpoints and declares bearer authentication', () => {
    const spec = createSpec();

    expect(spec.tags).toContainEqual(
      expect.objectContaining({name: 'plivo'}),
    );
    expect(spec['x-tagGroups']).toContainEqual(
      expect.objectContaining({
        name: 'Plivo Calls',
        tags: ['plivo'],
      }),
    );
    expect(spec.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });
});
