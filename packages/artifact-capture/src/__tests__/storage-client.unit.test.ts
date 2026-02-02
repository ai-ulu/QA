import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageClient } from '../storage-client';
import { ArtifactCaptureConfig } from '../types';
import { createReadStream } from 'fs';

// Mock MinIO client
const mockMinioClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  presignedGetObject: vi.fn(),
  removeObject: vi.fn(),
  listObjects: vi.fn()
};

// Mock fs module
vi.mock('fs', () => ({
  createReadStream: vi.fn(() => ({
    pipe: vi.fn()
  }))
}));

vi.mock('minio', () => ({
  Client: vi.fn(() => mockMinioClient)
}));

describe('StorageClient Unit Tests', () => {
  let storageClient: StorageClient;
  
  const mockConfig: ArtifactCaptureConfig = {
    minioEndpoint: 'localhost:9000',
    minioAccessKey: 'test-access',
    minioSecretKey: 'test-secret',
    bucketName: 'test-bucket',
    useSSL: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storageClient = new StorageClient(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize successfully when bucket exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      
      await storageClient.initialize();
      
      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('test-bucket');
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });

    it('should create bucket when it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);
      
      await storageClient.initialize();
      
      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('test-bucket');
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('test-bucket');
    });

    it('should handle initialization errors', async () => {
      mockMinioClient.bucketExists.mockRejectedValue(new Error('Connection failed'));
      
      await expect(storageClient.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('File Upload', () => {
    it('should upload file successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);
      
      const result = await storageClient.uploadFile(
        'test-object', 
        '/path/to/file.txt', 
        'text/plain'
      );
      
      expect(result).toBe('test-bucket/test-object');
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-object',
        expect.any(Object), // ReadStream object
        undefined,
        { 'Content-Type': 'text/plain' }
      );
    });

    it('should handle file upload errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Upload failed'));
      
      await expect(storageClient.uploadFile('test-object', '/path/to/file.txt'))
        .rejects.toThrow('Upload failed');
    });
  });

  describe('Buffer Upload', () => {
    it('should upload buffer successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);
      
      const buffer = Buffer.from('test content');
      const result = await storageClient.uploadBuffer(
        'test-buffer', 
        buffer, 
        'text/plain'
      );
      
      expect(result).toBe('test-bucket/test-buffer');
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-buffer',
        buffer,
        buffer.length,
        { 'Content-Type': 'text/plain' }
      );
    });

    it('should handle buffer upload errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Buffer upload failed'));
      
      const buffer = Buffer.from('test content');
      
      await expect(storageClient.uploadBuffer('test-buffer', buffer))
        .rejects.toThrow('Buffer upload failed');
    });
  });

  describe('JSON Upload', () => {
    it('should upload JSON successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);
      
      const data = { test: 'data', number: 42 };
      const result = await storageClient.uploadJSON('test.json', data);
      
      expect(result).toBe('test-bucket/test.json');
      
      const expectedBuffer = Buffer.from(JSON.stringify(data, null, 2));
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'test-bucket',
        'test.json',
        expectedBuffer,
        expectedBuffer.length,
        { 'Content-Type': 'application/json' }
      );
    });

    it('should handle JSON upload errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('JSON upload failed'));
      
      const data = { test: 'data' };
      
      await expect(storageClient.uploadJSON('test.json', data))
        .rejects.toThrow('JSON upload failed');
    });
  });

  describe('File URL Generation', () => {
    it('should generate file URL successfully', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      mockMinioClient.presignedGetObject.mockResolvedValue(expectedUrl);
      
      const url = await storageClient.getFileUrl('test-object', 7200);
      
      expect(url).toBe(expectedUrl);
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-object',
        7200
      );
    });

    it('should use default expiry when not specified', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      mockMinioClient.presignedGetObject.mockResolvedValue(expectedUrl);
      
      await storageClient.getFileUrl('test-object');
      
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-object',
        3600
      );
    });

    it('should handle URL generation errors', async () => {
      mockMinioClient.presignedGetObject.mockRejectedValue(new Error('URL generation failed'));
      
      await expect(storageClient.getFileUrl('test-object'))
        .rejects.toThrow('URL generation failed');
    });
  });

  describe('File Deletion', () => {
    it('should delete file successfully', async () => {
      mockMinioClient.removeObject.mockResolvedValue(undefined);
      
      await storageClient.deleteFile('test-object');
      
      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-object'
      );
    });

    it('should handle file deletion errors', async () => {
      mockMinioClient.removeObject.mockRejectedValue(new Error('Deletion failed'));
      
      await expect(storageClient.deleteFile('test-object'))
        .rejects.toThrow('Deletion failed');
    });
  });

  describe('File Listing', () => {
    it('should list files successfully', async () => {
      const mockObjects = [
        { name: 'file1.txt' },
        { name: 'file2.txt' },
        { name: 'file3.txt' }
      ];
      
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            mockObjects.forEach(obj => callback(obj));
          } else if (event === 'end') {
            callback();
          }
          return mockStream;
        })
      };
      
      mockMinioClient.listObjects.mockReturnValue(mockStream);
      
      const files = await storageClient.listFiles('test-prefix');
      
      expect(files).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);
      expect(mockMinioClient.listObjects).toHaveBeenCalledWith(
        'test-bucket',
        'test-prefix',
        true
      );
    });

    it('should handle file listing errors', async () => {
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Listing failed'));
          }
          return mockStream;
        })
      };
      
      mockMinioClient.listObjects.mockReturnValue(mockStream);
      
      await expect(storageClient.listFiles('test-prefix'))
        .rejects.toThrow('Listing failed');
    });

    it('should handle empty file list', async () => {
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'end') {
            callback();
          }
          return mockStream;
        })
      };
      
      mockMinioClient.listObjects.mockReturnValue(mockStream);
      
      const files = await storageClient.listFiles('empty-prefix');
      
      expect(files).toEqual([]);
    });
  });

  describe('Configuration', () => {
    it('should create storage client with correct config', () => {
      const client = new StorageClient(mockConfig);
      expect(client).toBeInstanceOf(StorageClient);
    });
  });
});