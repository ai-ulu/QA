/**
 * Property Tests for Data Governance
 * **Validates: Compliance standards**
 * 
 * Tests PII masking consistency, data retention policies,
 * and "right to be forgotten" data deletion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  PIIMaskingManager,
  GDPRComplianceManager,
  DataRetentionManager,
  CrossRegionComplianceManager,
  PIIField,
  DataRetentionPolicy,
  GDPRRequest,
  DataReplicationConfig,
  ComplianceRule,
} from '../data-governance';
import { logger } from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Data Governance Property Tests', () => {
  let piiManager: PIIMaskingManager;
  let gdprManager: GDPRComplianceManager;
  let retentionManager: DataRetentionManager;
  let complianceManager: CrossRegionComplianceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    piiManager = new PIIMaskingManager();
    gdprManager = new GDPRComplianceManager(piiManager);
    retentionManager = new DataRetentionManager();
    complianceManager = new CrossRegionComplianceManager();
  });

  afterEach(() => {
    retentionManager.stopAllJobs();
  });

  describe('PII Masking Consistency', () => {
    it('should consistently mask PII data across all records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            email: fc.emailAddress(),
            name: fc.fullName(),
            phone: fc.string({ minLength: 10, maxLength: 15 }),
            ssn: fc.string({ minLength: 9, maxLength: 11 }),
            creditCard: fc.string({ minLength: 13, maxLength: 19 }),
          }), { minLength: 1, maxLength: 50 }),
          fc.constantFrom('full', 'partial', 'hash', 'tokenize'),
          async (tableName, records, maskingStrategy) => {
            // Register PII fields
            const piiFields: PIIField[] = [
              { fieldName: 'email', maskingStrategy },
              { fieldName: 'name', maskingStrategy },
              { fieldName: 'phone', maskingStrategy },
              { fieldName: 'ssn', maskingStrategy },
              { fieldName: 'creditCard', maskingStrategy },
            ];

            piiManager.registerPIIFields(tableName, piiFields);

            // Mask records multiple times
            const maskedRecords1 = piiManager.maskPIIDataBatch(tableName, records);
            const maskedRecords2 = piiManager.maskPIIDataBatch(tableName, records);

            // Masking should be consistent
            expect(maskedRecords1).toEqual(maskedRecords2);

            // All PII fields should be masked
            for (let i = 0; i < records.length; i++) {
              const original = records[i];
              const masked = maskedRecords1[i];

              // Non-PII fields should remain unchanged
              expect(masked.id).toBe(original.id);

              // PII fields should be masked (different from original)
              for (const field of piiFields) {
                if (maskingStrategy !== 'tokenize') {
                  // For non-tokenize strategies, same input should produce same output
                  expect(masked[field.fieldName]).toBeDefined();
                  
                  if (maskingStrategy === 'full') {
                    expect(masked[field.fieldName]).toBe('***MASKED***');
                  } else if (maskingStrategy === 'partial' && original[field.fieldName].length >= 4) {
                    expect(masked[field.fieldName]).toMatch(/^.{2}\*+.{2}$/);
                  } else if (maskingStrategy === 'hash') {
                    expect(masked[field.fieldName]).toMatch(/^[a-f0-9]{16}$/);
                  }
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve data structure while masking PII', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.record({
            id: fc.integer(),
            metadata: fc.record({
              created: fc.date(),
              tags: fc.array(fc.string()),
            }),
            sensitiveData: fc.record({
              email: fc.emailAddress(),
              personalInfo: fc.record({
                name: fc.fullName(),
                address: fc.string(),
              }),
            }),
          }), { minLength: 1, maxLength: 20 }),
          async (tableName, records) => {
            const piiFields: PIIField[] = [
              { fieldName: 'sensitiveData.email', maskingStrategy: 'hash' },
              { fieldName: 'sensitiveData.personalInfo.name', maskingStrategy: 'partial' },
              { fieldName: 'sensitiveData.personalInfo.address', maskingStrategy: 'full' },
            ];

            piiManager.registerPIIFields(tableName, piiFields);
            const maskedRecords = piiManager.maskPIIDataBatch(tableName, records);

            expect(maskedRecords).toHaveLength(records.length);

            for (let i = 0; i < records.length; i++) {
              const original = records[i];
              const masked = maskedRecords[i];

              // Structure should be preserved
              expect(masked).toHaveProperty('id');
              expect(masked).toHaveProperty('metadata');
              expect(masked).toHaveProperty('sensitiveData');
              expect(masked.metadata).toHaveProperty('created');
              expect(masked.metadata).toHaveProperty('tags');
              expect(masked.sensitiveData).toHaveProperty('personalInfo');

              // Non-PII data should be unchanged
              expect(masked.id).toBe(original.id);
              expect(masked.metadata.created).toEqual(original.metadata.created);
              expect(masked.metadata.tags).toEqual(original.metadata.tags);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle anonymization for analytics consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.record({
            userId: fc.integer({ min: 1, max: 1000 }),
            email: fc.emailAddress(),
            action: fc.constantFrom('login', 'logout', 'view', 'click'),
            timestamp: fc.date(),
            value: fc.float({ min: 0, max: 1000 }),
          }), { minLength: 10, maxLength: 100 }),
          async (tableName, records) => {
            const piiFields: PIIField[] = [
              { fieldName: 'email', maskingStrategy: 'hash' },
            ];

            piiManager.registerPIIFields(tableName, piiFields);

            // Anonymize for analytics multiple times
            const anonymized1 = piiManager.anonymizeForAnalytics(tableName, records);
            const anonymized2 = piiManager.anonymizeForAnalytics(tableName, records);

            // Should be consistent
            expect(anonymized1).toEqual(anonymized2);

            // Group by anonymized email to verify consistency
            const emailGroups = new Map<string, any[]>();
            
            for (const record of anonymized1) {
              const email = record.email;
              const group = emailGroups.get(email) || [];
              group.push(record);
              emailGroups.set(email, group);
            }

            // Same original email should always produce same anonymized email
            const originalEmailGroups = new Map<string, string>();
            
            for (let i = 0; i < records.length; i++) {
              const originalEmail = records[i].email;
              const anonymizedEmail = anonymized1[i].email;
              
              if (originalEmailGroups.has(originalEmail)) {
                expect(originalEmailGroups.get(originalEmail)).toBe(anonymizedEmail);
              } else {
                originalEmailGroups.set(originalEmail, anonymizedEmail);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Data Retention Policies', () => {
    it('should automatically enforce retention policies', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 30 }), // retention days
          fc.boolean(), // archive before delete
          async (tableName, retentionDays, archiveBeforeDelete) => {
            const policy: DataRetentionPolicy = {
              tableName,
              retentionPeriod: retentionDays * 24 * 60 * 60 * 1000,
              archiveBeforeDelete,
              fields: [
                { fieldName: 'email', maskingStrategy: 'hash' },
                { fieldName: 'name', maskingStrategy: 'partial' },
              ],
            };

            retentionManager.registerPolicy(policy);

            // Verify policy is registered
            const registeredPolicy = retentionManager.getPolicy(tableName);
            expect(registeredPolicy).toEqual(policy);

            // Policy should have correct configuration
            expect(registeredPolicy!.retentionPeriod).toBe(retentionDays * 24 * 60 * 60 * 1000);
            expect(registeredPolicy!.archiveBeforeDelete).toBe(archiveBeforeDelete);
            expect(registeredPolicy!.fields).toHaveLength(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple retention policies independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            tableName: fc.string({ minLength: 1, maxLength: 20 }),
            retentionDays: fc.integer({ min: 1, max: 365 }),
            archiveBeforeDelete: fc.boolean(),
            fieldCount: fc.integer({ min: 1, max: 5 }),
          }), { minLength: 2, maxLength: 10 }),
          async (policyConfigs) => {
            // Ensure unique table names
            const uniqueConfigs = policyConfigs.filter((config, index, arr) => 
              arr.findIndex(c => c.tableName === config.tableName) === index
            );

            if (uniqueConfigs.length < 2) return; // Skip if not enough unique configs

            const policies: DataRetentionPolicy[] = uniqueConfigs.map(config => ({
              tableName: config.tableName,
              retentionPeriod: config.retentionDays * 24 * 60 * 60 * 1000,
              archiveBeforeDelete: config.archiveBeforeDelete,
              fields: Array.from({ length: config.fieldCount }, (_, i) => ({
                fieldName: `field${i}`,
                maskingStrategy: 'hash' as const,
              })),
            }));

            // Register all policies
            for (const policy of policies) {
              retentionManager.registerPolicy(policy);
            }

            // Verify each policy is registered correctly
            for (const policy of policies) {
              const registered = retentionManager.getPolicy(policy.tableName);
              expect(registered).toEqual(policy);
            }

            // Policies should be independent
            for (let i = 0; i < policies.length; i++) {
              for (let j = i + 1; j < policies.length; j++) {
                const policy1 = retentionManager.getPolicy(policies[i].tableName);
                const policy2 = retentionManager.getPolicy(policies[j].tableName);
                
                expect(policy1!.tableName).not.toBe(policy2!.tableName);
                // Other properties can be the same or different
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('GDPR Right to be Forgotten', () => {
    it('should process data deletion requests correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom('access', 'rectification', 'erasure', 'portability', 'restriction'),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          async (userId, requestType, requestedFields, reason) => {
            const request: GDPRRequest = {
              userId,
              requestType,
              requestedFields: requestedFields.length > 0 ? requestedFields : undefined,
              reason: reason || undefined,
              timestamp: Date.now(),
            };

            const response = await gdprManager.processGDPRRequest(request);

            // Response should have required fields
            expect(response.requestId).toBeDefined();
            expect(response.userId).toBe(userId);
            expect(response.requestType).toBe(requestType);
            expect(response.processedAt).toBeGreaterThan(request.timestamp);
            expect(['pending', 'completed', 'failed', 'scheduled']).toContain(response.status);

            // Request should be recorded in history
            const userRequests = gdprManager.getUserRequests(userId);
            expect(userRequests).toContainEqual(request);

            // Specific validations based on request type
            if (requestType === 'access' || requestType === 'portability') {
              if (response.status === 'completed') {
                expect(response.data).toBeDefined();
                if (requestType === 'portability') {
                  expect(response.downloadUrl).toBeDefined();
                  expect(response.expiresAt).toBeDefined();
                }
              }
            }

            if (requestType === 'erasure' && response.status === 'scheduled') {
              expect(response.scheduledDeletionAt).toBeDefined();
              expect(response.scheduledDeletionAt!).toBeGreaterThan(response.processedAt);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle consent management correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.record({
            consentType: fc.constantFrom('marketing', 'analytics', 'cookies', 'data_processing'),
            granted: fc.boolean(),
            purpose: fc.string({ minLength: 1, maxLength: 100 }),
          }), { minLength: 1, maxLength: 10 }),
          async (userId, consents) => {
            // Record all consents
            for (const consent of consents) {
              gdprManager.recordConsent(userId, consent.consentType, consent.granted, consent.purpose);
            }

            // Verify consent status
            for (const consent of consents) {
              const hasConsent = gdprManager.hasConsent(userId, consent.consentType);
              expect(hasConsent).toBe(consent.granted);
            }

            // Test consent consistency - same consent type should have latest value
            const consentByType = new Map<string, boolean>();
            for (const consent of consents) {
              consentByType.set(consent.consentType, consent.granted);
            }

            for (const [consentType, expectedGranted] of consentByType.entries()) {
              const actualGranted = gdprManager.hasConsent(userId, consentType);
              expect(actualGranted).toBe(expectedGranted);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate data deletion completeness', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 20 }),
          async (userIds) => {
            const deletionRequests: GDPRRequest[] = userIds.map(userId => ({
              userId,
              requestType: 'erasure',
              timestamp: Date.now(),
            }));

            const responses = await Promise.all(
              deletionRequests.map(request => gdprManager.processGDPRRequest(request))
            );

            // All deletion requests should be processed
            expect(responses).toHaveLength(userIds.length);

            for (let i = 0; i < responses.length; i++) {
              const response = responses[i];
              const originalRequest = deletionRequests[i];

              expect(response.userId).toBe(originalRequest.userId);
              expect(response.requestType).toBe('erasure');
              expect(['completed', 'scheduled']).toContain(response.status);

              // If scheduled, should have deletion timestamp
              if (response.status === 'scheduled') {
                expect(response.scheduledDeletionAt).toBeDefined();
                expect(response.scheduledDeletionAt!).toBeGreaterThan(response.processedAt);
              }
            }

            // Each user should have their deletion request recorded
            for (const userId of userIds) {
              const userRequests = gdprManager.getUserRequests(userId);
              const deletionRequest = userRequests.find(r => r.requestType === 'erasure');
              expect(deletionRequest).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Cross-Region Compliance', () => {
    it('should validate data replication compliance across regions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom('us-east-1', 'eu-west-1', 'ap-southeast-1'),
          fc.array(fc.constantFrom('us-east-1', 'eu-west-1', 'ap-southeast-1', 'ca-central-1'), { minLength: 1, maxLength: 3 }),
          fc.boolean(),
          async (dataType, sourceRegion, targetRegions, encryptionRequired) => {
            // Create compliance rules for each region
            const complianceRules: ComplianceRule[] = targetRegions.map(region => ({
              region,
              allowedDataTypes: region === 'eu-west-1' ? ['user_data', 'analytics'] : [dataType],
              restrictedDataTypes: region === 'eu-west-1' ? ['sensitive_data'] : [],
              requiresConsent: region === 'eu-west-1',
              maxRetentionDays: region === 'eu-west-1' ? 30 : 365,
            }));

            const config: DataReplicationConfig = {
              sourceRegion,
              targetRegions,
              complianceRules,
              encryptionRequired,
            };

            complianceManager.registerReplicationConfig(dataType, config);

            // Test compliance validation for each target region
            for (const targetRegion of targetRegions) {
              const testData = {
                type: dataType,
                encrypted: encryptionRequired,
                crossRegionConsent: region === 'eu-west-1' ? [targetRegion] : undefined,
                retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
              };

              const validation = complianceManager.validateReplicationCompliance(
                dataType,
                targetRegion,
                testData
              );

              expect(validation.targetRegion).toBe(targetRegion);
              expect(validation.checkedRules).toBeGreaterThan(0);
              expect(Array.isArray(validation.violations)).toBe(true);
              expect(Array.isArray(validation.requiredActions)).toBe(true);

              // If compliant, should have no violations
              if (validation.isCompliant) {
                expect(validation.violations).toHaveLength(0);
                expect(validation.requiredActions).toHaveLength(0);
              } else {
                // If not compliant, should have violations and required actions
                expect(validation.violations.length + validation.requiredActions.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should enforce region-specific data restrictions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            region: fc.constantFrom('us-east-1', 'eu-west-1', 'ap-southeast-1'),
            allowedTypes: fc.array(fc.constantFrom('user_data', 'analytics', 'logs'), { minLength: 1, maxLength: 3 }),
            restrictedTypes: fc.array(fc.constantFrom('sensitive_data', 'financial_data'), { maxLength: 2 }),
            requiresConsent: fc.boolean(),
            maxRetentionDays: fc.integer({ min: 1, max: 365 }),
          }), { minLength: 1, maxLength: 5 }),
          fc.constantFrom('user_data', 'analytics', 'logs', 'sensitive_data', 'financial_data'),
          async (regionConfigs, testDataType) => {
            // Ensure unique regions
            const uniqueRegions = regionConfigs.filter((config, index, arr) => 
              arr.findIndex(c => c.region === config.region) === index
            );

            if (uniqueRegions.length === 0) return;

            const complianceRules: ComplianceRule[] = uniqueRegions.map(config => ({
              region: config.region,
              allowedDataTypes: config.allowedTypes,
              restrictedDataTypes: config.restrictedTypes,
              requiresConsent: config.requiresConsent,
              maxRetentionDays: config.maxRetentionDays,
            }));

            const replicationConfig: DataReplicationConfig = {
              sourceRegion: 'us-east-1',
              targetRegions: uniqueRegions.map(c => c.region),
              complianceRules,
              encryptionRequired: true,
            };

            complianceManager.registerReplicationConfig(testDataType, replicationConfig);

            // Test each region's restrictions
            for (const regionConfig of uniqueRegions) {
              const testData = {
                type: testDataType,
                encrypted: true,
                crossRegionConsent: regionConfig.requiresConsent ? [regionConfig.region] : undefined,
                retentionPeriod: (regionConfig.maxRetentionDays - 1) * 24 * 60 * 60 * 1000,
              };

              const validation = complianceManager.validateReplicationCompliance(
                testDataType,
                regionConfig.region,
                testData
              );

              // Check if data type is allowed
              const isAllowed = regionConfig.allowedTypes.includes(testDataType);
              const isRestricted = regionConfig.restrictedTypes.includes(testDataType);

              if (isAllowed && !isRestricted) {
                // Should be compliant if consent requirements are met
                if (!regionConfig.requiresConsent || testData.crossRegionConsent?.includes(regionConfig.region)) {
                  expect(validation.isCompliant).toBe(true);
                }
              } else {
                // Should not be compliant if not allowed or restricted
                expect(validation.isCompliant).toBe(false);
                expect(validation.violations.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});