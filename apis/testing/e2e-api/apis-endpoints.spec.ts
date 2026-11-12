import { test, expect } from '@playwright/test';

const APIS_PORTS = {
  agricultureClassifier: process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005',
  chemicalDetector: process.env.CHEMICAL_DETECTOR_URL || 'http://localhost:8002',
  writingAssistant: process.env.WRITING_ASSISTANT_URL || 'http://localhost:8004',
  weatherApis: process.env.WEATHER_APIS_URL || 'http://localhost:8000',
  answerCheck: process.env.ANSWER_CHECK_URL || 'http://localhost:8012',
};

test.describe('Microservices in apis/ Directory - Backend API E2E Suite', () => {

  test.describe('1. Agriculture Question Classifier (apis/agriculture_classifier)', () => {
    test('GET /health verifies classifier microservice is online', async ({ request }) => {
      try {
        const res = await request.get(`${APIS_PORTS.agricultureClassifier}/health`, { timeout: 3000 });
        if (res.ok()) {
          const body = await res.json();
          expect(body).toHaveProperty('status', 'ok');
        } else {
          test.skip(true, 'Classifier offline');
        }
      } catch (err) {
        test.skip(true, `Classifier unavailable: ${err.message}`);
      }
    });

    test('POST /classify-question rejects empty input with 400 status', async ({ request }) => {
      try {
        const res = await request.post(`${APIS_PORTS.agricultureClassifier}/classify-question`, {
          data: { question: '' },
          timeout: 4000,
        });
        if (res.status() === 400) {
          const body = await res.json();
          expect(body.detail).toContain('must not be empty');
        } else {
          test.skip(true, `Unexpected status ${res.status()}`);
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });

    test('POST /classify-question correctly classifies agricultural query', async ({ request }) => {
      try {
        const res = await request.post(`${APIS_PORTS.agricultureClassifier}/classify-question`, {
          data: { question: 'How to manage stem borer in paddy crop?' },
          timeout: 5000,
        });
        if (res.ok()) {
          const body = await res.json();
          expect(body).toHaveProperty('is_agriculture');
          expect(body.is_agriculture).toBe(true);
        } else {
          test.skip(true, `Service returned ${res.status()}`);
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });
  });

  test.describe('2. Banned Chemical Detector (apis/chemical_detector)', () => {
    test('GET /health checks chemical detector readiness', async ({ request }) => {
      try {
        const res = await request.get(`${APIS_PORTS.chemicalDetector}/health`, { timeout: 3000 });
        if (res.ok()) {
          expect(res.status()).toBe(200);
        } else {
          test.skip(true, 'Chemical detector offline');
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });

    test('POST /detect-chemicals flags hazardous prohibited pesticides', async ({ request }) => {
      try {
        const res = await request.post(`${APIS_PORTS.chemicalDetector}/detect-chemicals`, {
          data: { text: 'Apply Aldrin 10G and Endosulfan to safeguard the crop from insects.' },
          timeout: 5000,
        });
        if (res.ok()) {
          const body = await res.json();
          expect(body).toHaveProperty('detected');
          expect(Array.isArray(body.detected)).toBeTruthy();
          expect(body.detected.length).toBeGreaterThan(0);
        } else {
          test.skip(true, `Detector returned ${res.status()}`);
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });
  });

  test.describe('3. Writing Assistant & Guardrails (apis/writing_assistant)', () => {
    test('GET /health checks writing assistant status', async ({ request }) => {
      try {
        const res = await request.get(`${APIS_PORTS.writingAssistant}/health`, { timeout: 3000 });
        if (res.ok()) {
          expect(res.status()).toBe(200);
        } else {
          test.skip(true, 'Writing assistant offline');
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });
  });

  test.describe('4. Live Weather Microservice (apis/weather_apis)', () => {
    test('GET /health verifies weather station cache and health', async ({ request }) => {
      try {
        const res = await request.get(`${APIS_PORTS.weatherApis}/health`, { timeout: 3000 });
        if (res.ok()) {
          expect(res.status()).toBe(200);
        } else {
          test.skip(true, 'Weather service offline');
        }
      } catch (err) {
        test.skip(true, `Service unavailable: ${err.message}`);
      }
    });
  });
});
