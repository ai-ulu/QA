import { ArtifactConfig, TestArtifact } from '../types';

export abstract class StorageProvider {
  protected config: ArtifactConfig['storage'];

  constructor(config: ArtifactConfig['storage']) {
    this.config = config;
  }

  abstract uploadArtifact(
    artifact: Buffer,
    key: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string>;

  abstract downloadArtifact(key: string): Promise<Buffer>;

  abstract deleteArtifact(key: string): Promise<void>;

  abstract listArtifacts(prefix: string): Promise<string[]>;

  abstract getArtifactUrl(key: string, expiresIn?: number): Promise<string>;

  protected generateKey(testId: string, executionId: string, type: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `artifacts/${testId}/${executionId}/${type}/${timestamp}.${extension}`;
  }
}