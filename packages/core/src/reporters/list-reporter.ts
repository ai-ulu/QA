import { TestResults, TestResult } from '../types';

/**
 * List reporter - prints test results in a list format
 */
export class ListReporter {
  report(results: TestResults): void {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('Test Results');
    console.log('='.repeat(60));
    console.log('\n');

    // Print each test result
    results.results.forEach((result) => {
      this.printResult(result);
    });

    // Print summary
    console.log('\n');
    console.log('-'.repeat(60));
    console.log('Summary');
    console.log('-'.repeat(60));
    console.log(`Total:   ${results.total}`);
    console.log(`Passed:  ${results.passed} ✓`);
    console.log(`Failed:  ${results.failed} ✗`);
    console.log(`Skipped: ${results.skipped} -`);
    console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
    console.log('\n');

    // Exit with error code if tests failed
    if (results.failed > 0) {
      process.exitCode = 1;
    }
  }

  private printResult(result: TestResult): void {
    const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '-';
    const color = result.status === 'passed' ? '\x1b[32m' : result.status === 'failed' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';

    const suiteName = result.test.suite ? `${result.test.suite} > ` : '';
    console.log(`${color}${icon}${reset} ${suiteName}${result.test.name} (${result.duration}ms)`);

    if (result.error) {
      console.log(`  ${color}Error: ${result.error.message}${reset}`);
      if (result.error.stack) {
        console.log(`  ${result.error.stack.split('\n').slice(1, 4).join('\n  ')}`);
      }
    }
  }
}
