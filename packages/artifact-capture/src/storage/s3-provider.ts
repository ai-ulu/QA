import AWS from 'aws-sdk';
import { StorageProvider } from './storage-provider';
import { ArtifactConfig } from '../types';

export class S3StorageProvider extends StorageProvider {
  private s3: AWS.S3;

  constructor(config: ArtifactConfig['storage']) {
    super(config);

    this.s3 = new AWS.S3({
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
      region: config.region || 'us-east-1',
      ...(config.endpoint && { endpoint: config.endpoint }),
    });

    this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.headBucket({ Bucket: this.config.bucket }).promise();
    } catch (error: any) {
      if (error.statusCode === 404) {
        await this.s3.createBucket({
          Bucket: this.config.bucket,
          CreateBucketConfiguration: {
            LocationConstraint: this.config.region || 'us-east-1',
          },
        }).promise();
      } else {
        throw error;
      }
    }
  }

  async uploadArtifact(
    artifact: Buffer,
    key: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      await this.s3.upload({
        Bucket: this.config.bucket,
        Key: key,
        Body: artifact,
        ContentType: contentType,
        Metadata: metadata || {},
      }).promise();

      return key;
    } catch (error) {
      console.error('Failed to upload artifact:', error);
      throw error;
    }
  }

  async downloadArtifact(key: string): Promise<Buffer> {
    try {
      const result = await this.s3.getObject({
        Bucket: this.config.bucket,
        Key: key,
      }).promise();

      return result.Body as Buffer;
    } catch (error) {
      console.error('Failed to download artifact:', error);
      throw error;
    }
  }

  async deleteArtifact(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({
        Bucket: this.config.bucket,
        Key: key,
      }).promise();
    } catch (error) {
      console.error('Failed to delete artifact:', error);
      throw error;
    }
  }

  async listArtifacts(prefix: string): Promise<string[]> {
    try {
      const result = await this.s3.listObjectsV2({
        Bucket: this.config.bucket,
        Prefix: prefix,
      }).promise();

      return result.Contents?.map(obj => obj.Key!) || [];
    } catch (error) {
      console.error('Failed to list artifacts:', error);
      throw error;
    }
  }

  async getArtifactUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      return this.s3.getSignedUrl('getObject', {
        Bucket: this.config.bucket,
        Key: key,
        Expires: expiresIn,
      });
    } catch (error) {
      console.error('Failed to generate artifact URL:', error);
      throw error;
    }
  }
}