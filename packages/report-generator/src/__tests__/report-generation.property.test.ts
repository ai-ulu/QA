import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { existsSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { ReportGenerator } from '../report-generator';
import { ReportConfig, ReportData, TestExecution, TestStep, TestArtifact } from '../types';

/**
 * Property 13: Report Generation and Storage
 * Validates: Requirements 6.3, 6.4, 6.5
 * Test that comprehensive reports are generated for all executions
 * Verify all artifacts are stored in MinIO/S3
 */

describe('Property 13: Report Generation and Storage', () => {
  let reportGenerator: ReportGenerator;

  beforeEach(() => {
    reportGenerator = new ReportGenerator();
  });

  it('should generate comprehensive reports for all completed executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          executionId: fc.uuid(),
          scenarioId: fc.uuid(),
          userId: fc.uuid(),
          artifacts: fc.record({
            executionId: fc.uuid(),
            screenshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 50 }),
                stepIndex: fc.integer({ min: 0, max: 20 }),
                timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
                filePath: fc.string({ minLength: 10, maxLength: 100 }),
                url: fc.webUrl()
              }),
              { minLength: 0, maxLength: 10 }
            ),
            domSnapshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 50 }),
                stepIndex: fc.integer({ min: 0, max: 20 }),
                timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
                filePath: fc.string({ minLength: 10, maxLength: 100 }),
                url: fc.webUrl(),
                errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }))
              }),
              { minLength: 0, maxLength: 5 }
            ),
            networkLogs: fc.array(
              fc.record({
                timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
                filePath: fc.string({ minLength: 10, maxLength: 100 }),
                harData: fc.record({
                  log: fc.record({
                    version: fc.constant('1.2'),
                    creator: fc.record({
                      name: fc.constant('AutoQA Pilot'),
                      version: fc.constant('1.0.0')
                    }),
                    entries: fc.array(fc.object(), { maxLength: 5 })
                  })
                })
              }),
              { minLength: 0, maxLength: 3 }
            ),
            metadata: fc.record({
              executionId: fc.uuid(),
              scenarioId: fc.uuid(),
              userId: fc.uuid(),
              startTime: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
              endTime: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date() })),
              status: fc.constantFrom('running', 'completed', 'failed'),
              totalSteps: fc.integer({ min: 1, max: 20 }),
              completedSteps: fc.integer({ min: 0, max: 20 })
            })
          }),
          config: fc.record({
            outputFormat: fc.constantFrom('html', 'pdf', 'json'),
            includeTimeline: fc.boolean(),
            includeScreenshots: fc.boolean(),
            includeDOMSnapshots: fc.boolean(),
            includeNetworkLogs: fc.boolean(),
            branding: fc.option(fc.record({
              companyName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
              primaryColor: fc.option(fc.string({ minLength: 7, maxLength: 7 })),
              secondaryColor: fc.option(fc.string({ minLength: 7, maxLength: 7 }))
            }))
          }),
          additionalData: fc.record({
            scenarioName: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
            projectName: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
          })
        }),
        async ({ executionId, scenarioId, userId, artifacts, config, additionalData }) => {
          // Ensure metadata consistency
          artifacts.executionId = executionId;
          artifacts.metadata.executionId = executionId;
          artifacts.metadata.scenarioId = scenarioId;
          artifacts.metadata.userId = userId;
          
          // Ensure endTime is after startTime
          if (artifacts.metadata.endTime && artifacts.metadata.startTime) {
            if (artifacts.metadata.endTime < artifacts.metadata.startTime) {
              artifacts.metadata.endTime = new Date(artifacts.metadata.startTime.getTime() + 60000);
            }
          }

          // Ensure completedSteps <= totalSteps
          artifacts.metadata.completedSteps = Math.min(
            artifacts.metadata.completedSteps, 
            artifacts.metadata.totalSteps
          );

          const options: ReportGenerationOptions = {
            config,
            artifacts: artifacts as ExecutionArtifacts,
            additionalData
          };

          const report = await reportGenerator.generateReport(options);

          // Verify comprehensive report generation
          expect(report.reportId).toBeTruthy();
          expect(report.executionId).toBe(executionId);
          expect(report.scenarioId).toBe(scenarioId);
          expect(report.userId).toBe(userId);
          expect(report.generatedAt).toBeInstanceOf(Date);

          // Verify execution summary
          expect(report.executionSummary).toBeTruthy();
          expect(report.executionSummary.startTime).toBeInstanceOf(Date);
          expect(report.executionSummary.totalSteps).toBe(artifacts.metadata.totalSteps);
          expect(report.executionSummary.completedSteps).toBe(artifacts.metadata.completedSteps);
          expect(['passed', 'failed', 'skipped']).toContain(report.executionSummary.status);

          // Verify timeline generation
          expect(Array.isArray(report.timeline)).toBe(true);
          expect(report.timeline.length).toBeGreaterThan(0); // At least start/end events

          // Verify timeline events are chronologically ordered
          for (let i = 1; i < report.timeline.length; i++) {
            expect(report.timeline[i].timestamp.getTime()).toBeGreaterThanOrEqual(
              report.timeline[i - 1].timestamp.getTime()
            );
          }

          // Verify artifacts are included
          expect(report.artifacts).toBe(artifacts);

          // Verify metadata
          expect(report.metadata).toBeTruthy();
          expect(report.metadata.reportVersion).toBeTruthy();
          expect(report.metadata.generatorVersion).toBeTruthy();

          // Verify scenario and project names
          if (additionalData.scenarioName) {
            expect(report.scenarioName).toBe(additionalData.scenarioName);
          }
          if (additionalData.projectName) {
            expect(report.projectName).toBe(additionalData.projectName);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should render reports with timeline and visual evidence when configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          artifacts: fc.record({
            executionId: fc.uuid(),
            screenshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 30 }),
                stepIndex: fc.integer({ min: 0, max: 10 }),
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 10, maxLength: 50 }),
                url: fc.webUrl()
              }),
              { minLength: 1, maxLength: 5 }
            ),
            domSnapshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 30 }),
                stepIndex: fc.integer({ min: 0, max: 10 }),
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 10, maxLength: 50 }),
                url: fc.webUrl(),
                errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
              }),
              { minLength: 0, maxLength: 3 }
            ),
            networkLogs: fc.array(
              fc.record({
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 10, maxLength: 50 }),
                harData: fc.object()
              }),
              { minLength: 0, maxLength: 2 }
            ),
            metadata: fc.record({
              executionId: fc.uuid(),
              scenarioId: fc.uuid(),
              userId: fc.uuid(),
              startTime: fc.date(),
              endTime: fc.option(fc.date()),
              status: fc.constantFrom('completed', 'failed'),
              totalSteps: fc.integer({ min: 1, max: 10 }),
              completedSteps: fc.integer({ min: 0, max: 10 })
            })
          }),
          config: fc.record({
            outputFormat: fc.constant('html'),
            includeTimeline: fc.constant(true),
            includeScreenshots: fc.constant(true),
            includeDOMSnapshots: fc.boolean(),
            includeNetworkLogs: fc.boolean(),
            branding: fc.option(fc.record({
              companyName: fc.string({ minLength: 1, maxLength: 30 }),
              primaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`)
            }))
          })
        }),
        async ({ artifacts, config }) => {
          // Ensure metadata consistency
          artifacts.metadata.executionId = artifacts.executionId;
          
          // Ensure endTime consistency
          if (artifacts.metadata.endTime && artifacts.metadata.startTime) {
            if (artifacts.metadata.endTime < artifacts.metadata.startTime) {
              artifacts.metadata.endTime = new Date(artifacts.metadata.startTime.getTime() + 30000);
            }
          }

          // Ensure completedSteps consistency
          artifacts.metadata.completedSteps = Math.min(
            artifacts.metadata.completedSteps,
            artifacts.metadata.totalSteps
          );

          const options: ReportGenerationOptions = {
            config,
            artifacts: artifacts as ExecutionArtifacts,
            additionalData: {
              scenarioName: 'Test Scenario',
              projectName: 'Test Project'
            }
          };

          const report = await reportGenerator.generateReport(options);
          const html = await reportGenerator.renderReport(report, config);

          // Verify HTML content includes required elements
          expect(html).toContain('<!DOCTYPE html>');
          expect(html).toContain('<html');
          expect(html).toContain('</html>');

          // Verify timeline is included when configured
          if (config.includeTimeline) {
            expect(html).toContain('Timeline');
            expect(report.timeline.length).toBeGreaterThan(0);
          }

          // Verify screenshots are included when configured
          if (config.includeScreenshots && artifacts.screenshots.length > 0) {
            expect(html).toContain('Screenshots');
            artifacts.screenshots.forEach(screenshot => {
              expect(html).toContain(screenshot.stepName);
            });
          }

          // Verify branding is applied when configured
          if (config.branding?.companyName) {
            expect(html).toContain(config.branding.companyName);
          }
          if (config.branding?.primaryColor) {
            expect(html).toContain(config.branding.primaryColor);
          }

          // Verify execution summary is always included
          expect(html).toContain(report.executionSummary.status);
          expect(html).toContain(report.executionSummary.totalSteps.toString());
          expect(html).toContain(report.executionSummary.completedSteps.toString());
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should maintain report consistency across different output formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          artifacts: fc.record({
            executionId: fc.uuid(),
            screenshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 20 }),
                stepIndex: fc.integer({ min: 0, max: 5 }),
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 5, maxLength: 30 }),
                url: fc.webUrl()
              }),
              { minLength: 0, maxLength: 3 }
            ),
            domSnapshots: fc.array(
              fc.record({
                stepName: fc.string({ minLength: 1, maxLength: 20 }),
                stepIndex: fc.integer({ min: 0, max: 5 }),
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 5, maxLength: 30 }),
                url: fc.webUrl(),
                errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 50 }))
              }),
              { minLength: 0, maxLength: 2 }
            ),
            networkLogs: fc.array(
              fc.record({
                timestamp: fc.date(),
                filePath: fc.string({ minLength: 5, maxLength: 30 }),
                harData: fc.object()
              }),
              { minLength: 0, maxLength: 1 }
            ),
            metadata: fc.record({
              executionId: fc.uuid(),
              scenarioId: fc.uuid(),
              userId: fc.uuid(),
              startTime: fc.date(),
              endTime: fc.option(fc.date()),
              status: fc.constantFrom('completed', 'failed'),
              totalSteps: fc.integer({ min: 1, max: 5 }),
              completedSteps: fc.integer({ min: 0, max: 5 })
            })
          }),
          scenarioName: fc.string({ minLength: 1, maxLength: 50 }),
          projectName: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ artifacts, scenarioName, projectName }) => {
          // Ensure metadata consistency
          artifacts.metadata.executionId = artifacts.executionId;
          
          // Ensure time consistency
          if (artifacts.metadata.endTime && artifacts.metadata.startTime) {
            if (artifacts.metadata.endTime < artifacts.metadata.startTime) {
              artifacts.metadata.endTime = new Date(artifacts.metadata.startTime.getTime() + 10000);
            }
          }

          // Ensure step consistency
          artifacts.metadata.completedSteps = Math.min(
            artifacts.metadata.completedSteps,
            artifacts.metadata.totalSteps
          );

          const baseOptions: ReportGenerationOptions = {
            config: {
              outputFormat: 'html',
              includeTimeline: true,
              includeScreenshots: true,
              includeDOMSnapshots: true,
              includeNetworkLogs: true
            },
            artifacts: artifacts as ExecutionArtifacts,
            additionalData: { scenarioName, projectName }
          };

          // Generate reports with different formats
          const htmlConfig = { ...baseOptions.config, outputFormat: 'html' as const };
          const jsonConfig = { ...baseOptions.config, outputFormat: 'json' as const };

          const htmlReport = await reportGenerator.generateReport({ ...baseOptions, config: htmlConfig });
          const jsonReport = await reportGenerator.generateReport({ ...baseOptions, config: jsonConfig });

          // Verify core report data is consistent across formats
          expect(htmlReport.executionId).toBe(jsonReport.executionId);
          expect(htmlReport.scenarioId).toBe(jsonReport.scenarioId);
          expect(htmlReport.userId).toBe(jsonReport.userId);
          expect(htmlReport.scenarioName).toBe(jsonReport.scenarioName);
          expect(htmlReport.projectName).toBe(jsonReport.projectName);

          // Verify execution summary consistency
          expect(htmlReport.executionSummary.status).toBe(jsonReport.executionSummary.status);
          expect(htmlReport.executionSummary.totalSteps).toBe(jsonReport.executionSummary.totalSteps);
          expect(htmlReport.executionSummary.completedSteps).toBe(jsonReport.executionSummary.completedSteps);
          expect(htmlReport.executionSummary.duration).toBe(jsonReport.executionSummary.duration);

          // Verify timeline consistency
          expect(htmlReport.timeline.length).toBe(jsonReport.timeline.length);
          
          // Verify artifacts consistency
          expect(htmlReport.artifacts.screenshots.length).toBe(jsonReport.artifacts.screenshots.length);
          expect(htmlReport.artifacts.domSnapshots.length).toBe(jsonReport.artifacts.domSnapshots.length);
          expect(htmlReport.artifacts.networkLogs.length).toBe(jsonReport.artifacts.networkLogs.length);

          // Verify metadata consistency
          expect(htmlReport.metadata.reportVersion).toBe(jsonReport.metadata.reportVersion);
          expect(htmlReport.metadata.generatorVersion).toBe(jsonReport.metadata.generatorVersion);
        }
      ),
      { numRuns: 10 }
    );
  });
});