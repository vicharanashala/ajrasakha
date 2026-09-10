import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BadRequestError,
  InternalServerError,
} from 'routing-controllers';
import {aiConfig} from '#root/config/ai.js';
import {appConfig} from '#root/config/app.js';
import {storageConfig} from '#root/config/storage.js';
import {PlantNetService} from './PlantNetService.js';
import {PlantKnowledgeService} from './PlantKnowledgeService.js';

export interface PlantScanResult {
  identified: boolean;
  plantName: string | null;
  scientificName: string | null;
  confidence: number;

  condition: string | null;
  severity: 'low' | 'medium' | 'high' | null;

  observations: string[];
  recommendations: string[];
  benefits: string[];

  commonProblems: Array<{
    name: string;
    symptoms: string;
    treatment: string;
  }>;

  knowledgeAvailable: boolean;

  plantNetCandidates: Array<{
    score: number;
    scientificName: string;
    commonNames: string[];
    genus: string | null;
    family: string | null;
  }>;

  diseases: Array<{
    code: string;
    name: string;
    score: number;
    description: string | null;
  }>;

  diseaseAnalysisAvailable: boolean;
}

const localImageDirectory = path.join(
  os.tmpdir(),
  'ajrasakha-plant-scans',
);

/**
 * Application-level threshold for surfacing a PlantNet disease
 * result as a meaningful health signal.
 *
 * PlantNet still provides the underlying score. This threshold
 * only controls what AjraSakha presents to the user.
 */
const MIN_DISEASE_SCORE_TO_SURFACE = 0.5;

function logPlantScanStage(message: string): void {
  console.info(`[PlantScanService] ${message}`);
}

function logPlantScanError(error: unknown): void {
  const name =
    error instanceof Error ? error.name : typeof error;

  const message =
    error instanceof Error ? error.message : String(error);

  const safeMessage = message
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(
      /((?:key|token|secret|password)=)[^&\s]+/gi,
      '$1[redacted]',
    );

  console.error('[PlantScanService] Error', {
    name,
    message: safeMessage,
  });
}

export class PlantScanService {
  private readonly plantNetService =
    new PlantNetService();

  private readonly plantKnowledgeService =
    new PlantKnowledgeService();

  async analyze(
    file: Express.Multer.File,
  ): Promise<PlantScanResult> {
    if (!file?.buffer) {
      throw new BadRequestError(
        'An image file is required',
      );
    }

    const objectName = `plant-scans/${randomUUID()}.${this.getExtension(
      file.mimetype,
    )}`;

    let localFilePath: string | null = null;

    if (appConfig.isDevelopment) {
      logPlantScanStage(
        'Local image save started',
      );

      try {
        localFilePath =
          await this.saveLocalImage(
            objectName,
            file,
          );
      } catch (error) {
        logPlantScanError(error);
        throw error;
      }
    }

    const bucketName = appConfig.isDevelopment
      ? null
      : (() => {
          try {
            return this.getAiServerBucketName();
          } catch (error) {
            logPlantScanError(error);
            throw error;
          }
        })();

    const storage = appConfig.isDevelopment
      ? null
      : new (
          await import('@google-cloud/storage')
        ).Storage();

    const object =
      storage && bucketName
        ? storage
            .bucket(bucketName)
            .file(objectName)
        : null;

    try {
      let url: string;

      if (localFilePath) {
        logPlantScanStage(
          'Local image save completed',
        );

        logPlantScanStage(
          'Local image URL generation started',
        );

        url =
          this.getLocalImageUrl(
            objectName,
          );

        logPlantScanStage(
          'Local image URL generation completed',
        );
      } else if (object) {
        logPlantScanStage(
          'GCS image save started',
        );

        await object.save(file.buffer, {
          contentType: file.mimetype,
          resumable: false,
          metadata: {
            cacheControl:
              'private, max-age=300',
          },
        });

        logPlantScanStage(
          'GCS image save completed',
        );

        logPlantScanStage(
          'Signed URL generation started',
        );

        [url] =
          await object.getSignedUrl({
            action: 'read',
            expires:
              Date.now() +
              5 * 60 * 1000,
          });

        logPlantScanStage(
          'Signed URL generation completed',
        );
      } else {
        throw new InternalServerError(
          'Plant image storage is unavailable.',
        );
      }

      // The storage URL is retained for the existing
      // image-storage flow. PlantNet receives the uploaded
      // image buffer directly.
      void url;

      logPlantScanStage(
        'PlantNet identification request started',
      );

      const plantNetResult =
        await this.plantNetService.identify(
          file,
        );

      logPlantScanStage(
        'PlantNet identification request completed',
      );

      if (!plantNetResult.bestMatch) {
        return {
          identified: false,
          plantName: null,
          scientificName: null,
          confidence: 0,
          condition: null,
          severity: null,
          observations: [],
          recommendations: [
            'Retake the image in good lighting with the plant clearly visible.',
            'Try a closer image focused on the leaf or plant structure.',
          ],
          benefits: [],
          commonProblems: [],
          knowledgeAvailable: false,
          plantNetCandidates:
            plantNetResult.candidates,
          diseases: [],
          diseaseAnalysisAvailable: false,
        };
      }

      const bestMatch =
        plantNetResult.bestMatch;

      const knowledge =
        this.plantKnowledgeService.getKnowledge(
          bestMatch.scientificName,
        );

      let diseases: PlantScanResult['diseases'] =
        [];

      let diseaseAnalysisAvailable =
        false;

      try {
        logPlantScanStage(
          'PlantNet disease identification request started',
        );

        const diseaseResult =
          await this.plantNetService.identifyDiseases(
            file,
            plantNetResult.predictedOrgan,
          );

        diseaseAnalysisAvailable =
          true;

        const rawDiseases =
          diseaseResult.diseases;

        diseases =
          rawDiseases.filter(
            (disease) =>
              disease.score >=
              MIN_DISEASE_SCORE_TO_SURFACE,
          );

        logPlantScanStage(
          `PlantNet disease identification request completed with ${rawDiseases.length} result(s); ${diseases.length} passed the ${MIN_DISEASE_SCORE_TO_SURFACE} surfacing threshold`,
        );
      } catch (error) {
        // Disease analysis is a secondary step.
        // A disease API failure must not discard a valid
        // species identification.
        logPlantScanError(error);

        logPlantScanStage(
          'PlantNet disease analysis unavailable; returning plant identification',
        );
      }

      return {
        identified: true,

        plantName:
          bestMatch.commonNames[0] ||
          bestMatch.scientificName,

        scientificName:
          bestMatch.scientificName,

        confidence: bestMatch.score,

        condition: null,
        severity: null,

        observations:
          plantNetResult.predictedOrgan
            ? [
                `Image appears to contain a ${plantNetResult.predictedOrgan}.`,
              ]
            : [],

        recommendations:
          knowledge?.recommendations ?? [
            'Retake the image in good lighting if the identification looks incorrect.',
            'Confirm the plant and symptoms before applying any treatment.',
          ],

        benefits:
          knowledge?.benefits ?? [],

        commonProblems:
          knowledge?.commonProblems ?? [],

        knowledgeAvailable:
          knowledge !== null,

        plantNetCandidates:
          plantNetResult.candidates,

        diseases,

        diseaseAnalysisAvailable,
      };
    } catch (error) {
      logPlantScanError(error);

      if (
        error instanceof InternalServerError
      ) {
        throw error;
      }

      throw new InternalServerError(
        'Plant image analysis failed.',
      );
    } finally {
      if (localFilePath) {
        await this.deleteLocalImage(
          localFilePath,
        );
      } else if (object) {
        try {
          await object.delete();
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  }

  getLocalImagePath(
    fileName: string,
  ): string | null {
    if (
      !appConfig.isDevelopment ||
      path.basename(fileName) !== fileName
    ) {
      return null;
    }

    return path.join(
      localImageDirectory,
      fileName,
    );
  }

  private async saveLocalImage(
    objectName: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const fileName =
      path.basename(objectName);

    const filePath =
      this.getLocalImagePath(fileName);

    if (!filePath) {
      throw new InternalServerError(
        'Local plant image storage is unavailable.',
      );
    }

    await fs.mkdir(
      localImageDirectory,
      {recursive: true},
    );

    await fs.writeFile(
      filePath,
      file.buffer,
      {mode: 0o600},
    );

    return filePath;
  }

  private getLocalImageUrl(
    objectName: string,
  ): string {
    const fileName =
      path.basename(objectName);

    const baseUrl =
      aiConfig.plantScanLocalImageBaseUrl.replace(
        /\/$/,
        '',
      );

    const routePrefix =
      appConfig.routePrefix
        .replace(/^\//, '')
        .replace(/\/$/, '');

    return `${baseUrl}/${routePrefix}/plant-scan/local-image/${fileName}`;
  }

  private async deleteLocalImage(
    filePath: string,
  ): Promise<void> {
    try {
      await fs.rm(
        filePath,
        {force: true},
      );
    } catch {
      // Best-effort cleanup.
    }
  }

  private getAiServerBucketName(): string {
    const bucketName =
      storageConfig.googleCloud
        .aiServerBucketName?.trim();

    if (!bucketName) {
      throw new InternalServerError(
        'Plant scan is not configured: AI server bucket is missing.',
      );
    }

    return bucketName;
  }

  private getExtension(
    mimeType: string,
  ): string {
    switch (mimeType) {
      case 'image/png':
        return 'png';

      case 'image/webp':
        return 'webp';

      case 'image/jpeg':
      case 'image/jpg':
      default:
        return 'jpg';
    }
  }
}