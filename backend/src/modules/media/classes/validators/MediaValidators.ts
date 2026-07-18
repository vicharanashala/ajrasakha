import multer from 'multer';
import { BadRequestError } from 'routing-controllers';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { MediaKind } from '#root/shared/interfaces/models.js';

export const MEDIA_KINDS: MediaKind[] = ['carousel', 'outreach_image', 'outreach_video'];

/**
 * Images and videos only. Note: Cloud Run caps an inbound request at ~32 MiB, so the
 * limit here is set just under that — larger videos need a direct-to-bucket (signed URL)
 * upload instead of routing the bytes through the API.
 */
export const MediaUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 31 * 1024 * 1024 }, // ~31 MB (Cloud Run request cap is 32 MiB)
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only image or video files are allowed'));
    }
  },
};

export class UploadMediaBody {
  @IsIn(MEDIA_KINDS)
  kind: MediaKind;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class ListMediaQuery {
  @IsOptional()
  @IsIn(MEDIA_KINDS)
  kind?: MediaKind;
}

/** Request a signed PUT URL for a direct-to-bucket upload (large videos). */
export class SignedUrlBody {
  @IsIn(MEDIA_KINDS)
  kind: MediaKind;

  @IsString()
  filename: string;

  @IsString()
  contentType: string;
}

/** Finalise a direct upload once the browser has PUT the bytes to the bucket. */
export class CompleteUploadBody {
  @IsIn(MEDIA_KINDS)
  kind: MediaKind;

  @IsString()
  storagePath: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class YoutubeBody {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

/** Image kinds an external link can be attached to (not videos). */
export const IMAGE_MEDIA_KINDS: MediaKind[] = ['carousel', 'outreach_image'];

export class ImageLinkBody {
  @IsIn(IMAGE_MEDIA_KINDS)
  kind: MediaKind;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export const MEDIA_VALIDATORS = [
  UploadMediaBody,
  ListMediaQuery,
  SignedUrlBody,
  CompleteUploadBody,
  YoutubeBody,
  ImageLinkBody,
];
