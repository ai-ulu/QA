import { Client as MinioClient } from 'minio';
import { StorageProvider } from './storage-provider';
import { ArtifactConfig } from '../types';

export class MinioStorageProvider extends StorageProvider {
  private client: MinioClient;

  constructor(config: ArtifactConfig['storage']) {
    super(config);
    
    if (!config.endpoint) {
      throw new Error('MinIO endpoint is required');
    }

    this.client = new MinioClient({
      endPoint: config.endpoint.replace(/^https?:\/\//, ''),
      port: config.endpoint.includes('https') ? 443 : 9000,
      useSSL: config.endpoint.includes('https'),
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.config.bucket);
      if (!exists) {
        await this.client.makeBucket(this.config.bucket, this.config.region || 'us-east-1');
      }
    } catch (error) {
      console.error('Failed to ensure bucket exists:', error);
      throw error;
    }
  }

  async uploadArtifact(
    artifact: Buffer,
    key: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      const metaData = {
        'Content-Type': contentType,
        ...metadata,
      };

      await this.client.putObject(this.config.bucket, key, artifact, artifact.length, metaData);
      return key;
    } catch (error) {
      console.error('Failed to upload artifact:', error);
      throw error;
    }
  }

  async downloadArtifact(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.config.bucket, key);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to download artifact:', error);
      throw error;
    }
  }

  async deleteArtifact(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.config.bucket, key);
    } catch (error) {
      console.error('Failed to delete artifact:', error);
      throw error;
    }
  }

  async listArtifacts(prefix: string): Promise<string[]> {
    try {
      const objects: string[] = [];
      const stream = this.client.listObjects(this.config.bucket, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objects.push(obj.name!));
        stream.on('end', () => resolve(objects));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to list artifacts:', error);
      throw error;
    }
  }

  async getArtifactUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.config.bucket, key, expiresIn);
    } catch (error) {
      console.error('Failed to generate artifact URL:', error);
      throw error;
    }
  }
}