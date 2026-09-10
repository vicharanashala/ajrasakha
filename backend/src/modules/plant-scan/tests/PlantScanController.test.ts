import {describe, expect, it, vi} from 'vitest';
import {PlantScanController} from '../controllers/PlantScanController.js';

describe('PlantScanController local image route', () => {
  it('waits for sendFile and returns the response', async () => {
    const service = {
      getLocalImagePath: vi.fn(() => '/tmp/plant-scan-image.jpg'),
    } as any;
    const response = {
      sendFile: vi.fn((_filePath: string, callback: (error?: Error) => void) => {
        callback();
      }),
    } as any;

    const result = await new PlantScanController(service).getLocalImage(
      'plant-scan-image.jpg',
      response,
    );

    expect(service.getLocalImagePath).toHaveBeenCalledWith(
      'plant-scan-image.jpg',
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      '/tmp/plant-scan-image.jpg',
      expect.any(Function),
    );
    expect(result).toBe(response);
  });
});