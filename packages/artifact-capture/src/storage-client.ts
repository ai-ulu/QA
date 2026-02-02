import { Client as MinioClient } from 'minio';
import { createReadStream } from 'fs';
import { ArtifactConfig } from './types';
import { logger } from './utils/logger';

export class StorageClient {
  private client: MinioClient;
  private bucketName: string;

  constructor(config: ArtifactCaptureConfig) {
    this.client = new MinioClient({
      endPoint: config.minioEndpoint,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
      useSSL: config.useSSL ?? false
    });
    this.bucketName = config.bucketName;
  }

  async initialize(): Promise<void> {
    try {
      const bucketExists = await this.client.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.client.makeBucket(this.bucketName);
        logger.info(`Created bucket: ${this.bucketName}`);
      }
    } catch (error) {
      logger.error('Failed to initialize storage client', { error });
      throw error;
    }
  }

  async uploadFile(
    objectName: string, 
    filePath: string, 
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    try {
      const fileStream = createReadStream(filePath);
      await this.client.putObject(this.bucketName, objectName, fileStream, undefined, {
        'Content-Type': contentType
      });
      
      logger.info(`Uploaded file: ${objectName}`);
      return `${this.bucketName}/${objectName}`;
    } catch (error) {
      logger.error('Failed to upload file', { objectName, filePath, error });
      throw error;
    }
  }

  async uploadBuffer(
    objectName: string, 
    buffer: Buffer, 
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    try {
      await this.client.putObject(this.bucketName, objectName, buffer, buffer.length, {
        'Content-Type': contentType
      });
      
      logger.info(`Uploaded buffer: ${objectName}`);
      return `${this.bucketName}/${objectName}`;
    } catch (error) {
      logger.error('Failed to upload buffer', { objectName, error });
      throw error;
    }
  }

  async uploadJSON(objectName: string, data: any): Promise<string> {
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    return this.uploadBuffer(objectName, buffer, 'application/json');
  }

  async getFileUrl(objectName: string, expiry: number = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucketName, objectName, expiry);
    } catch (error) {
      logger.error('Failed to generate file URL', { objectName, error });
      throw error;
    }
  }

  async deleteFile(objectName: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucketName, objectName);
      logger.info(`Deleted file: ${objectName}`);
    } catch (error) {
      logger.error('Failed to delete file', { objectName, error });
      throw error;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const objects: string[] = [];
      const stream = this.client.listObjects(this.bucketName, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objects.push(obj.name!));
        stream.on('error', reject);
        stream.on('end', () => resolve(objects));
      });
    } catch (error) {
      logger.error('Failed to list files', { prefix, error });
      throw error;
    }
  }
}