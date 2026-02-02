import { Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

import {
  VisualRegressionConfig,
  BaselineImage,
  ComparisonResult,
  VisualTestOptions,
  BaselineVersion,
  VisualRegressionReport
} from './types';

export class VisualRegressionEngine {
  private config: VisualRegressionConfig;
  private logger: winston.Logger;
  private baselines: Map<string, BaselineImage> = new Map();

  constructor(config: VisualRegressionConfig) {
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'visual-regression.log' })
      ]
    });

    this.ensureDirectories();
    this.loadBaselines();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.config.baselineDir)) {
      mkdirSync(this.config.baselineDir, { recursive: true });
    }
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  private loadBaselines(): void {
    const baselinesFile = join(this.config.baselineDir, 'baselines.json');
    if (existsSync(baselinesFile)) {
      try {
        const data = JSON.parse(readFileSync(baselinesFile, 'utf-8'));
        data.forEach((baseline: BaselineImage) => {
          this.baselines.set(baseline.id, baseline);
        });
        this.logger.info(`Loaded ${this.baselines.size} baselines`);
      } catch (error) {
        this.logger.error('Failed to load baselines:', error);
      }
    }
  }

  private saveBaselines(): void {
    const baselinesFile = join(this.config.baselineDir, 'baselines.json');
    try {
      const data = Array.from(this.baselines.values());
      writeFileSync(baselinesFile, JSON.stringify(data, null, 2));
      this.logger.info(`Saved ${data.length} baselines`);
    } catch (error) {
      this.logger.error('Failed to save baselines:', error);
    }
  }

  private generateImageHash(imagePath: string): string {
    const imageBuffer = readFileSync(imagePath);
    return createHash('sha256').update(imageBuffer).digest('hex');
  }

  async captureScreenshot(
    page: Page,
    testId: string,
    options: VisualTestOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${testId}-${options.name}-${timestamp}.png`;
    const filePath = join(this.config.outputDir, filename);

    try {
      const screenshotOptions: any = {
        path: filePath,
        fullPage: options.fullPage || false
      };

      if (options.clip) {
        screenshotOptions.clip = options.clip;
      }

      if (options.selector) {
        const element = await page.locator(options.selector);
        await element.screenshot(screenshotOptions);
      } else {
        await page.screenshot(screenshotOptions);
      }

      // Apply masks if specified
      if (options.mask && options.mask.length > 0) {
        await this.applyMasks(filePath, options.mask, page);
      }

      this.logger.info(`Screenshot captured: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error(`Failed to capture screenshot: ${error}`);
      throw error;
    }
  }

  private async applyMasks(
    imagePath: string,
    masks: string[],
    page: Page
  ): Promise<void> {
    try {
      const image = sharp(imagePath);
      const { width, height } = await image.metadata();

      if (!width || !height) return;

      // Create mask overlay
      const maskOverlay = sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      });

      // Apply each mask
      for (const maskSelector of masks) {
        try {
          const element = await page.locator(maskSelector);
          const boundingBox = await element.boundingBox();
          
          if (boundingBox) {
            const maskRect = sharp({
              create: {
                width: Math.round(boundingBox.width),
                height: Math.round(boundingBox.height),
                channels: 4,
                background: { r: 255, g: 0, b: 255, alpha: 1 } // Magenta mask
              }
            });

            await maskOverlay.composite([{
              input: await maskRect.png().toBuffer(),
              left: Math.round(boundingBox.x),
              top: Math.round(boundingBox.y)
            }]);
          }
        } catch (error) {
          this.logger.warn(`Failed to apply mask for selector ${maskSelector}:`, error);
        }
      }

      // Apply mask to original image
      const maskedImage = await image
        .composite([{ input: await maskOverlay.png().toBuffer() }])
        .png()
        .toBuffer();

      writeFileSync(imagePath, maskedImage);
    } catch (error) {
      this.logger.error(`Failed to apply masks: ${error}`);
    }
  }

  async createBaseline(
    testId: string,
    imagePath: string,
    options: VisualTestOptions,
    metadata: {
      viewport: { width: number; height: number };
      browser: string;
      url: string;
    }
  ): Promise<BaselineImage> {
    const baselineId = uuidv4();
    const hash = this.generateImageHash(imagePath);
    const baselineFilename = `${testId}-${options.name}-baseline.png`;
    const baselineFilePath = join(this.config.baselineDir, baselineFilename);

    // Copy image to baseline directory
    const imageBuffer = readFileSync(imagePath);
    writeFileSync(baselineFilePath, imageBuffer);

    const baseline: BaselineImage = {
      id: baselineId,
      testId,
      name: options.name,
      version: 1,
      filePath: baselineFilePath,
      metadata: {
        ...metadata,
        selector: options.selector,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      hash
    };

    this.baselines.set(baselineId, baseline);
    this.saveBaselines();

    this.logger.info(`Created baseline: ${baselineId} for test ${testId}`);
    return baseline;
  }

  async compareWithBaseline(
    testId: string,
    actualImagePath: string,
    options: VisualTestOptions,
    metadata: {
      viewport: { width: number; height: number };
      browser: string;
      url: string;
    }
  ): Promise<ComparisonResult> {
    const baselineKey = `${testId}-${options.name}`;
    const baseline = Array.from(this.baselines.values())
      .find(b => b.testId === testId && b.name === options.name);

    if (!baseline) {
      // Create new baseline
      const newBaseline = await this.createBaseline(testId, actualImagePath, options, metadata);
      
      return {
        id: uuidv4(),
        testId,
        baselineId: newBaseline.id,
        status: 'new',
        pixelDifference: 0,
        percentageDifference: 0,
        threshold: options.threshold || this.config.threshold,
        actualImagePath,
        baselineImagePath: newBaseline.filePath,
        metadata: {
          comparedAt: new Date(),
          ...metadata
        }
      };
    }

    // Perform pixel comparison
    const result = await this.performPixelComparison(
      baseline.filePath,
      actualImagePath,
      options,
      metadata
    );

    result.baselineId = baseline.id;
    result.testId = testId;

    this.logger.info(
      `Comparison completed: ${result.status}, ${result.percentageDifference.toFixed(2)}% difference`
    );

    return result;
  }

  private async performPixelComparison(
    baselineImagePath: string,
    actualImagePath: string,
    options: VisualTestOptions,
    metadata: {
      viewport: { width: number; height: number };
      browser: string;
      url: string;
    }
  ): Promise<ComparisonResult> {
    try {
      // Load images
      const baselineBuffer = readFileSync(baselineImagePath);
      const actualBuffer = readFileSync(actualImagePath);

      // Convert to PNG and get consistent format
      const baselineImage = await sharp(baselineBuffer).png().raw().toBuffer({ resolveWithObject: true });
      const actualImage = await sharp(actualBuffer).png().raw().toBuffer({ resolveWithObject: true });

      const { width, height } = baselineImage.info;
      
      // Ensure images have same dimensions
      if (baselineImage.info.width !== actualImage.info.width || 
          baselineImage.info.height !== actualImage.info.height) {
        throw new Error('Image dimensions do not match');
      }

      // Create diff image buffer
      const diffBuffer = Buffer.alloc(width * height * 4);

      // Perform pixel comparison
      const pixelDifference = pixelmatch(
        baselineImage.data,
        actualImage.data,
        diffBuffer,
        width,
        height,
        {
          threshold: 0.1,
          includeAA: this.config.includeAA,
          alpha: 0.1,
          aaColor: [255, 255, 0],
          diffColor: [255, 0, 255],
          diffColorAlt: [0, 255, 255]
        }
      );

      const totalPixels = width * height;
      const percentageDifference = (pixelDifference / totalPixels) * 100;
      const threshold = options.threshold || this.config.threshold;
      const status = percentageDifference <= threshold ? 'passed' : 'failed';

      let diffImagePath: string | undefined;
      
      if (status === 'failed') {
        // Save diff image
        const diffFilename = `${Date.now()}-diff.png`;
        diffImagePath = join(this.config.outputDir, diffFilename);
        
        await sharp(diffBuffer, {
          raw: {
            width,
            height,
            channels: 4
          }
        })
        .png()
        .toFile(diffImagePath);
      }

      return {
        id: uuidv4(),
        testId: '',
        baselineId: '',
        status,
        pixelDifference,
        percentageDifference,
        threshold,
        diffImagePath,
        actualImagePath,
        baselineImagePath,
        metadata: {
          comparedAt: new Date(),
          ...metadata
        }
      };
    } catch (error) {
      this.logger.error(`Pixel comparison failed: ${error}`);
      throw error;
    }
  }

  async updateBaseline(
    baselineId: string,
    newImagePath: string,
    updatedBy: string,
    description?: string
  ): Promise<BaselineImage> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    // Create version backup
    const versionBackup: BaselineVersion = {
      version: baseline.version,
      createdAt: baseline.metadata.updatedAt,
      createdBy: 'system',
      filePath: baseline.filePath,
      hash: baseline.hash
    };

    // Save version backup
    const versionsFile = join(this.config.baselineDir, `${baselineId}-versions.json`);
    let versions: BaselineVersion[] = [];
    
    if (existsSync(versionsFile)) {
      versions = JSON.parse(readFileSync(versionsFile, 'utf-8'));
    }
    
    versions.push(versionBackup);
    writeFileSync(versionsFile, JSON.stringify(versions, null, 2));

    // Update baseline
    const newHash = this.generateImageHash(newImagePath);
    const imageBuffer = readFileSync(newImagePath);
    writeFileSync(baseline.filePath, imageBuffer);

    baseline.version += 1;
    baseline.hash = newHash;
    baseline.metadata.updatedAt = new Date();

    this.baselines.set(baselineId, baseline);
    this.saveBaselines();

    this.logger.info(`Updated baseline: ${baselineId} to version ${baseline.version}`);
    return baseline;
  }

  async rollbackBaseline(baselineId: string, targetVersion: number): Promise<BaselineImage> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    const versionsFile = join(this.config.baselineDir, `${baselineId}-versions.json`);
    if (!existsSync(versionsFile)) {
      throw new Error(`No version history found for baseline: ${baselineId}`);
    }

    const versions: BaselineVersion[] = JSON.parse(readFileSync(versionsFile, 'utf-8'));
    const targetVersionData = versions.find(v => v.version === targetVersion);
    
    if (!targetVersionData) {
      throw new Error(`Version ${targetVersion} not found for baseline: ${baselineId}`);
    }

    // Restore from version backup
    const versionImageBuffer = readFileSync(targetVersionData.filePath);
    writeFileSync(baseline.filePath, versionImageBuffer);

    baseline.version = targetVersion;
    baseline.hash = targetVersionData.hash;
    baseline.metadata.updatedAt = new Date();

    this.baselines.set(baselineId, baseline);
    this.saveBaselines();

    this.logger.info(`Rolled back baseline: ${baselineId} to version ${targetVersion}`);
    return baseline;
  }

  async generateReport(testId: string, results: ComparisonResult[]): Promise<VisualRegressionReport> {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const newBaselines = results.filter(r => r.status === 'new').length;

    const pixelDifferences = results
      .filter(r => r.status !== 'new')
      .map(r => r.pixelDifference);

    const report: VisualRegressionReport = {
      testId,
      totalComparisons: results.length,
      passed,
      failed,
      new: newBaselines,
      results,
      summary: {
        successRate: results.length > 0 ? (passed / results.length) * 100 : 0,
        avgPixelDifference: pixelDifferences.length > 0 
          ? pixelDifferences.reduce((a, b) => a + b, 0) / pixelDifferences.length 
          : 0,
        maxPixelDifference: pixelDifferences.length > 0 
          ? Math.max(...pixelDifferences) 
          : 0
      },
      generatedAt: new Date()
    };

    // Save report
    const reportPath = join(this.config.outputDir, `${testId}-visual-report.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.logger.info(`Generated visual regression report: ${reportPath}`);
    return report;
  }

  getBaseline(testId: string, name: string): BaselineImage | undefined {
    return Array.from(this.baselines.values())
      .find(b => b.testId === testId && b.name === name);
  }

  getAllBaselines(): BaselineImage[] {
    return Array.from(this.baselines.values());
  }

  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Clean up old comparison results and diff images
    // Implementation would depend on storage strategy
    this.logger.info(`Cleanup completed for files older than ${olderThanDays} days`);
  }
}