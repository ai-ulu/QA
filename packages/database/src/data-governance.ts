/**
 * Data Governance and Compliance
 * **Validates: Compliance & Data Governance**
 * 
 * Implements PII masking, GDPR/KVKK compliance, data retention policies,
 * and cross-region data replication compliance.
 */

import { logger } from './utils/logger';
import * as crypto from 'crypto';

export interface PIIField {
  fieldName: string;
  maskingStrategy: 'full' | 'partial' | 'hash' | 'tokenize';
  retentionPeriod?: number; // in milliseconds
  isRequired?: boolean;
}

export interface DataRetentionPolicy {
  tableName: string;
  retentionPeriod: number; // in milliseconds
  archiveBeforeDelete: boolean;
  fields: PIIField[];
}

export interface GDPRRequest {
  userId: string;
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
  requestedFields?: string[];
  reason?: string;
  timestamp: number;
}

export interface DataReplicationConfig {
  sourceRegion: string;
  targetRegions: string[];
  complianceRules: ComplianceRule[];
  encryptionRequired: boolean;
}

export interface ComplianceRule {
  region: string;
  allowedDataTypes: string[];
  restrictedDataTypes: string[];
  requiresConsent: boolean;
  maxRetentionDays: number;
}

/**
 * PII Masking and Anonymization Manager
 */
export class PIIMaskingManager {
  private maskingStrategies = new Map<string, (value: any) => string>();
  private piiFields = new Map<string, PIIField[]>();

  constructor() {
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default masking strategies
   */
  private initializeDefaultStrategies(): void {
    this.maskingStrategies.set('full', () => '***MASKED***');
    this.maskingStrategies.set('partial', (value: string) => {
      if (typeof value !== 'string' || value.length < 4) return '***';
      return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
    });
    this.maskingStrategies.set('hash', (value: string) => {
      return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
    });
    this.maskingStrategies.set('tokenize', (value: string) => {
      return `TOKEN_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    });
  }

  /**
   * Register PII fields for a table
   */
  registerPIIFields(tableName: string, fields: PIIField[]): void {
    this.piiFields.set(tableName, fields);
    logger.info(`Registered PII fields for table ${tableName}`, {
      fieldCount: fields.length,
      fields: fields.map(f => ({ name: f.fieldName, strategy: f.maskingStrategy })),
    });
  }

  /**
   * Mask PII data in a record
   */
  maskPIIData(tableName: string, record: any): any {
    const piiFields = this.piiFields.get(tableName);
    if (!piiFields) {
      return record;
    }

    const maskedRecord = { ...record };

    for (const field of piiFields) {
      if (field.fieldName in maskedRecord) {
        const strategy = this.maskingStrategies.get(field.maskingStrategy);
        if (strategy) {
          maskedRecord[field.fieldName] = strategy(maskedRecord[field.fieldName]);
        }
      }
    }

    return maskedRecord;
  }

  /**
   * Mask multiple records
   */
  maskPIIDataBatch(tableName: string, records: any[]): any[] {
    return records.map(record => this.maskPIIData(tableName, record));
  }

  /**
   * Check if field contains PII
   */
  isPIIField(tableName: string, fieldName: string): boolean {
    const piiFields = this.piiFields.get(tableName);
    return piiFields?.some(field => field.fieldName === fieldName) || false;
  }

  /**
   * Get PII fields for table
   */
  getPIIFields(tableName: string): PIIField[] {
    return this.piiFields.get(tableName) || [];
  }

  /**
   * Anonymize data for analytics
   */
  anonymizeForAnalytics(tableName: string, records: any[]): any[] {
    const piiFields = this.piiFields.get(tableName);
    if (!piiFields) {
      return records;
    }

    return records.map(record => {
      const anonymized = { ...record };
      
      for (const field of piiFields) {
        if (field.fieldName in anonymized) {
          // Use hash strategy for analytics to maintain consistency
          const hashStrategy = this.maskingStrategies.get('hash');
          if (hashStrategy) {
            anonymized[field.fieldName] = hashStrategy(anonymized[field.fieldName]);
          }
        }
      }

      return anonymized;
    });
  }
}

/**
 * GDPR/KVKK Compliance Manager
 */
export class GDPRComplianceManager {
  private requests = new Map<string, GDPRRequest[]>();
  private consentRecords = new Map<string, ConsentRecord>();
  private piiManager: PIIMaskingManager;

  constructor(piiManager: PIIMaskingManager) {
    this.piiManager = piiManager;
  }

  /**
   * Process GDPR request
   */
  async processGDPRRequest(request: GDPRRequest): Promise<GDPRResponse> {
    logger.info(`Processing GDPR request`, {
      userId: request.userId,
      type: request.requestType,
      timestamp: request.timestamp,
    });

    // Store request for audit trail
    const userRequests = this.requests.get(request.userId) || [];
    userRequests.push(request);
    this.requests.set(request.userId, userRequests);

    switch (request.requestType) {
      case 'access':
        return await this.handleDataAccess(request);
      case 'rectification':
        return await this.handleDataRectification(request);
      case 'erasure':
        return await this.handleDataErasure(request);
      case 'portability':
        return await this.handleDataPortability(request);
      case 'restriction':
        return await this.handleProcessingRestriction(request);
      default:
        throw new Error(`Unsupported GDPR request type: ${request.requestType}`);
    }
  }

  /**
   * Handle data access request (Right to Access)
   */
  private async handleDataAccess(request: GDPRRequest): Promise<GDPRResponse> {
    // In production, this would query all tables for user data
    const userData = await this.collectUserData(request.userId);
    
    return {
      requestId: this.generateRequestId(),
      userId: request.userId,
      requestType: request.requestType,
      status: 'completed',
      data: userData,
      processedAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    };
  }

  /**
   * Handle data rectification request (Right to Rectification)
   */
  private async handleDataRectification(request: GDPRRequest): Promise<GDPRResponse> {
    // In production, this would update user data across all tables
    logger.info(`Processing data rectification for user ${request.userId}`);
    
    return {
      requestId: this.generateRequestId(),
      userId: request.userId,
      requestType: request.requestType,
      status: 'completed',
      processedAt: Date.now(),
    };
  }

  /**
   * Handle data erasure request (Right to be Forgotten)
   */
  private async handleDataErasure(request: GDPRRequest): Promise<GDPRResponse> {
    logger.info(`Processing data erasure for user ${request.userId}`);
    
    // Mark user for deletion
    await this.markUserForDeletion(request.userId);
    
    // Schedule actual deletion (with grace period)
    await this.scheduleDataDeletion(request.userId, 30 * 24 * 60 * 60 * 1000); // 30 days
    
    return {
      requestId: this.generateRequestId(),
      userId: request.userId,
      requestType: request.requestType,
      status: 'scheduled',
      processedAt: Date.now(),
      scheduledDeletionAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Handle data portability request (Right to Data Portability)
   */
  private async handleDataPortability(request: GDPRRequest): Promise<GDPRResponse> {
    const userData = await this.collectUserData(request.userId);
    const portableData = this.formatForPortability(userData);
    
    return {
      requestId: this.generateRequestId(),
      userId: request.userId,
      requestType: request.requestType,
      status: 'completed',
      data: portableData,
      processedAt: Date.now(),
      downloadUrl: await this.generateSecureDownloadUrl(portableData),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    };
  }

  /**
   * Handle processing restriction request (Right to Restriction)
   */
  private async handleProcessingRestriction(request: GDPRRequest): Promise<GDPRResponse> {
    logger.info(`Processing restriction request for user ${request.userId}`);
    
    // Mark user data as restricted
    await this.markUserDataRestricted(request.userId, true);
    
    return {
      requestId: this.generateRequestId(),
      userId: request.userId,
      requestType: request.requestType,
      status: 'completed',
      processedAt: Date.now(),
    };
  }

  /**
   * Collect all user data across tables
   */
  private async collectUserData(userId: string): Promise<any> {
    // In production, this would query all tables containing user data
    return {
      profile: { userId, email: 'user@example.com', name: 'John Doe' },
      projects: [],
      testResults: [],
      auditLogs: [],
    };
  }

  /**
   * Mark user for deletion
   */
  private async markUserForDeletion(userId: string): Promise<void> {
    // In production, this would update user record with deletion flag
    logger.info(`Marked user ${userId} for deletion`);
  }

  /**
   * Schedule data deletion
   */
  private async scheduleDataDeletion(userId: string, delayMs: number): Promise<void> {
    // In production, this would schedule a job for actual deletion
    setTimeout(async () => {
      await this.performDataDeletion(userId);
    }, delayMs);
  }

  /**
   * Perform actual data deletion
   */
  private async performDataDeletion(userId: string): Promise<void> {
    logger.info(`Performing data deletion for user ${userId}`);
    // In production, this would delete user data from all tables
  }

  /**
   * Format data for portability
   */
  private formatForPortability(userData: any): any {
    return {
      format: 'JSON',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: userData,
    };
  }

  /**
   * Generate secure download URL
   */
  private async generateSecureDownloadUrl(data: any): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    // In production, this would store the data temporarily and return a secure URL
    return `https://api.example.com/gdpr/download/${token}`;
  }

  /**
   * Mark user data as restricted
   */
  private async markUserDataRestricted(userId: string, restricted: boolean): Promise<void> {
    // In production, this would update user record with restriction flag
    logger.info(`Set data restriction for user ${userId}: ${restricted}`);
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `GDPR_${Date.now()}_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }

  /**
   * Record user consent
   */
  recordConsent(userId: string, consentType: string, granted: boolean, purpose: string): void {
    const consent: ConsentRecord = {
      userId,
      consentType,
      granted,
      purpose,
      timestamp: Date.now(),
      ipAddress: '0.0.0.0', // In production, get from request
      userAgent: 'Unknown', // In production, get from request
    };

    this.consentRecords.set(`${userId}_${consentType}`, consent);
    
    logger.info(`Recorded consent for user ${userId}`, {
      consentType,
      granted,
      purpose,
    });
  }

  /**
   * Check if user has given consent
   */
  hasConsent(userId: string, consentType: string): boolean {
    const consent = this.consentRecords.get(`${userId}_${consentType}`);
    return consent?.granted || false;
  }

  /**
   * Get all GDPR requests for user
   */
  getUserRequests(userId: string): GDPRRequest[] {
    return this.requests.get(userId) || [];
  }
}

/**
 * Data Retention Policy Manager
 */
export class DataRetentionManager {
  private policies = new Map<string, DataRetentionPolicy>();
  private retentionJobs = new Map<string, NodeJS.Timeout>();

  /**
   * Register data retention policy
   */
  registerPolicy(policy: DataRetentionPolicy): void {
    this.policies.set(policy.tableName, policy);
    this.scheduleRetentionJob(policy);
    
    logger.info(`Registered data retention policy for ${policy.tableName}`, {
      retentionPeriod: policy.retentionPeriod,
      archiveBeforeDelete: policy.archiveBeforeDelete,
      piiFieldCount: policy.fields.length,
    });
  }

  /**
   * Schedule retention job
   */
  private scheduleRetentionJob(policy: DataRetentionPolicy): void {
    const existingJob = this.retentionJobs.get(policy.tableName);
    if (existingJob) {
      clearInterval(existingJob);
    }

    // Run retention check daily
    const job = setInterval(() => {
      this.enforceRetentionPolicy(policy.tableName);
    }, 24 * 60 * 60 * 1000);

    this.retentionJobs.set(policy.tableName, job);
  }

  /**
   * Enforce retention policy for table
   */
  async enforceRetentionPolicy(tableName: string): Promise<void> {
    const policy = this.policies.get(tableName);
    if (!policy) {
      return;
    }

    logger.info(`Enforcing retention policy for ${tableName}`);

    const cutoffDate = Date.now() - policy.retentionPeriod;
    
    // In production, this would query the database for expired records
    const expiredRecords = await this.findExpiredRecords(tableName, cutoffDate);

    if (expiredRecords.length === 0) {
      return;
    }

    if (policy.archiveBeforeDelete) {
      await this.archiveRecords(tableName, expiredRecords);
    }

    await this.deleteExpiredRecords(tableName, expiredRecords);

    logger.info(`Retention policy enforced for ${tableName}`, {
      expiredRecords: expiredRecords.length,
      archived: policy.archiveBeforeDelete,
    });
  }

  /**
   * Find expired records
   */
  private async findExpiredRecords(tableName: string, cutoffDate: number): Promise<any[]> {
    // In production, this would query the database
    // For now, return empty array
    return [];
  }

  /**
   * Archive records before deletion
   */
  private async archiveRecords(tableName: string, records: any[]): Promise<void> {
    // In production, this would move records to archive storage
    logger.info(`Archived ${records.length} records from ${tableName}`);
  }

  /**
   * Delete expired records
   */
  private async deleteExpiredRecords(tableName: string, records: any[]): Promise<void> {
    // In production, this would delete records from the database
    logger.info(`Deleted ${records.length} expired records from ${tableName}`);
  }

  /**
   * Get retention policy for table
   */
  getPolicy(tableName: string): DataRetentionPolicy | undefined {
    return this.policies.get(tableName);
  }

  /**
   * Stop all retention jobs
   */
  stopAllJobs(): void {
    for (const job of this.retentionJobs.values()) {
      clearInterval(job);
    }
    this.retentionJobs.clear();
  }
}

/**
 * Cross-Region Data Replication Compliance
 */
export class CrossRegionComplianceManager {
  private replicationConfigs = new Map<string, DataReplicationConfig>();
  private complianceRules = new Map<string, ComplianceRule[]>();

  /**
   * Register replication configuration
   */
  registerReplicationConfig(dataType: string, config: DataReplicationConfig): void {
    this.replicationConfigs.set(dataType, config);
    
    // Index compliance rules by region
    for (const rule of config.complianceRules) {
      const regionRules = this.complianceRules.get(rule.region) || [];
      regionRules.push(rule);
      this.complianceRules.set(rule.region, regionRules);
    }

    logger.info(`Registered cross-region replication config for ${dataType}`, {
      sourceRegion: config.sourceRegion,
      targetRegions: config.targetRegions,
      rulesCount: config.complianceRules.length,
    });
  }

  /**
   * Validate data replication compliance
   */
  validateReplicationCompliance(
    dataType: string,
    targetRegion: string,
    data: any
  ): ComplianceValidationResult {
    const config = this.replicationConfigs.get(dataType);
    if (!config) {
      return {
        isCompliant: false,
        violations: [`No replication config found for data type: ${dataType}`],
        requiredActions: ['Register replication configuration'],
      };
    }

    const regionRules = this.complianceRules.get(targetRegion);
    if (!regionRules) {
      return {
        isCompliant: false,
        violations: [`No compliance rules found for region: ${targetRegion}`],
        requiredActions: ['Define compliance rules for target region'],
      };
    }

    const violations: string[] = [];
    const requiredActions: string[] = [];

    for (const rule of regionRules) {
      // Check if data type is allowed in target region
      if (!rule.allowedDataTypes.includes(dataType)) {
        violations.push(`Data type ${dataType} not allowed in region ${targetRegion}`);
        requiredActions.push('Remove restricted data or choose different region');
      }

      // Check if data type is restricted
      if (rule.restrictedDataTypes.includes(dataType)) {
        violations.push(`Data type ${dataType} is restricted in region ${targetRegion}`);
        requiredActions.push('Apply additional restrictions or anonymization');
      }

      // Check consent requirements
      if (rule.requiresConsent && !this.hasUserConsent(data, targetRegion)) {
        violations.push(`User consent required for replication to ${targetRegion}`);
        requiredActions.push('Obtain user consent for cross-region data transfer');
      }

      // Check retention limits
      if (data.retentionPeriod && data.retentionPeriod > rule.maxRetentionDays * 24 * 60 * 60 * 1000) {
        violations.push(`Retention period exceeds limit for region ${targetRegion}`);
        requiredActions.push(`Reduce retention period to ${rule.maxRetentionDays} days or less`);
      }
    }

    // Check encryption requirements
    if (config.encryptionRequired && !this.isDataEncrypted(data)) {
      violations.push('Data encryption required for cross-region replication');
      requiredActions.push('Encrypt data before replication');
    }

    return {
      isCompliant: violations.length === 0,
      violations,
      requiredActions,
      checkedRules: regionRules.length,
      targetRegion,
    };
  }

  /**
   * Check if user has given consent for cross-region transfer
   */
  private hasUserConsent(data: any, targetRegion: string): boolean {
    // In production, this would check consent records
    return data.crossRegionConsent?.includes(targetRegion) || false;
  }

  /**
   * Check if data is encrypted
   */
  private isDataEncrypted(data: any): boolean {
    // In production, this would check encryption metadata
    return data.encrypted === true || data.encryptionKey !== undefined;
  }

  /**
   * Get compliance rules for region
   */
  getComplianceRules(region: string): ComplianceRule[] {
    return this.complianceRules.get(region) || [];
  }

  /**
   * Get replication config for data type
   */
  getReplicationConfig(dataType: string): DataReplicationConfig | undefined {
    return this.replicationConfigs.get(dataType);
  }
}

// Interfaces
interface ConsentRecord {
  userId: string;
  consentType: string;
  granted: boolean;
  purpose: string;
  timestamp: number;
  ipAddress: string;
  userAgent: string;
}

interface GDPRResponse {
  requestId: string;
  userId: string;
  requestType: string;
  status: 'pending' | 'completed' | 'failed' | 'scheduled';
  data?: any;
  processedAt: number;
  expiresAt?: number;
  downloadUrl?: string;
  scheduledDeletionAt?: number;
}

interface ComplianceValidationResult {
  isCompliant: boolean;
  violations: string[];
  requiredActions: string[];
  checkedRules?: number;
  targetRegion?: string;
}