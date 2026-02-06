import { TestResults } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JSON reporter - outputs test results as JSON
 */
export class JsonReporter {
  private outputPath: string;

  constructor(outputPath: string = 'test-results.json') {
    this.outputPath = outputPath;
  }

  report(results: TestResults): void {
    const output = {
      summary: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        duration: results.duration,
      },
      tests: results.results.map((result) => ({
        id: result.test.id,
        name: result.test.name,
        suite: result.test.suite,
        status: result.status,
        duration: result.duration,
        error: result.error
          ? {
              message: result.error.message,
              stack: result.error.stack,
            }
          : undefined,
      })),
    };

    // Ensure directory exists
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write JSON file
    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2));
    console.log(`\nTest results written to ${this.outputPath}`);
  }
}
