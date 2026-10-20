import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Types users may upload, with the extension the stored file gets. No HTML or SVG (they can run scripts). */
export const UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Any S3-compatible bucket (Cloudflare R2, AWS S3, …) served publicly from S3_PUBLIC_URL. */
@Injectable()
export class StorageService {
  private readonly s3?: S3Client;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    const bucket = config.get('S3_BUCKET', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    if (bucket && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: config.get('S3_REGION', { infer: true }),
        endpoint: config.get('S3_ENDPOINT', { infer: true }),
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async upload(file: UploadedFile, uploadedBy?: string): Promise<{ file_url: string }> {
    const ext = UPLOAD_TYPES[file.mimetype];
    if (!ext) throw new BadRequestException('Upload a PDF, image, Word or text file');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Files must be 10 MB or smaller');
    const publicUrl = this.config.get('S3_PUBLIC_URL', { infer: true });
    if (!this.s3 || !publicUrl) throw new ServiceUnavailableException('File uploads are not configured');

    const now = new Date();
    const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.get('S3_BUCKET', { infer: true }),
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: file.mimetype.startsWith('image/') ? 'inline' : 'attachment',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    const file_url = `${publicUrl.replace(/\/$/, '')}/${key}`;
    await this.prisma.fileUpload.create({
      data: { key, url: file_url, content_type: file.mimetype, size: file.size, uploaded_by: uploadedBy },
    });
    return { file_url };
  }
}
