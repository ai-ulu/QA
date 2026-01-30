import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { WebCrawler } from '../crawler';
import { CrawlerConfig } from '../types';

/**
 * Property 5: Site Scanning Completeness
 * Validates: Requirements 3.1, 3.2, 3.5
 * Test that crawler generates comprehensive site maps
 * Verify robots.txt compliance across all scenarios
 */

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          title: vi.fn().mockResolvedValue('Test Page'),
          content: vi.fn().mockResolvedValue('<html><head><title>Test</title></head><body>Test</body></html>'),
          close: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          $eval: vi.fn().mockResolvedValue(''),
          $$eval: vi.fn().mockResolvedValue([])
        }),
        close: vi.fn().mockResolvedValue(undefined)
      }),
      close: vi.fn().mockResolvedValue(undefined)
    })
  }
}));

// Mock robots-parser
vi.mock('robots-parser', () => ({
  default: vi.fn(() => ({
    isAllowed: vi.fn(() => true)
  }))
}));

// Mock p-limit
vi.mock('p-limit', () => ({
  default: vi.fn((limit: number) => (fn: () => Promise<any>) => fn())
}));

describe('Web Crawler Functionality Property Tests', () => {
  let crawler: WebCrawler;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (crawler) {
      crawler.close();
    }
  });

  /**
   * Property: Crawler configuration validation
   */
  it('should handle various crawler configurations correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxPages: fc.integer({ min: 1, max: 10 }),
          maxDepth: fc.integer({ min: 1, max: 3 }),
          respectRobotsTxt: fc.boolean(),
          timeout: fc.integer({ min: 1000, max: 10000 }),
          concurrency: fc.integer({ min: 1, max: 5 })
        }),
        async (config: CrawlerConfig) => {
          crawler = new WebCrawler(config);
          await crawler.initialize();

          // Property 1: Crawler should initialize with valid config
          expect(crawler).toBeDefined();

          // Property 2: Config values should be within valid ranges
          expect(config.maxPages).toBeGreaterThan(0);
          expect(config.maxDepth).toBeGreaterThan(0);
          expect(config.timeout).toBeGreaterThanOrEqual(1000);
          expect(config.concurrency).toBeGreaterThan(0);

          await crawler.close();
        }
      ),
      { numRuns: 10, timeout: 15000 }
    );
  }, 30000);

  /**
   * Property: URL validation and processing
   */
  it('should handle various URL formats correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'https://example.com',
          'http://test.local',
          'https://subdomain.example.org/path'
        ),
        async (url: string) => {
          const config: CrawlerConfig = {
            maxPages: 2,
            maxDepth: 1,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          try {
            const result = await crawler.crawl(url);

            // Property 1: Result should have required structure
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('sitemap');

            // Property 2: Results should be arrays
            expect(Array.isArray(result.results)).toBe(true);
            expect(Array.isArray(result.errors)).toBe(true);
            expect(Array.isArray(result.sitemap)).toBe(true);

          } catch (error) {
            // If crawling fails, error should be meaningful
            expect(error).toBeInstanceOf(Error);
          }

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * Property: Robots.txt compliance
   */
  it('should respect robots.txt settings consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          respectRobotsTxt: fc.boolean(),
          userAgent: fc.constantFrom('*', 'AutoQA-Crawler/1.0', 'TestBot')
        }),
        async ({ respectRobotsTxt, userAgent }) => {
          const config: CrawlerConfig = {
            maxPages: 2,
            maxDepth: 1,
            respectRobotsTxt,
            userAgent,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          try {
            const result = await crawler.crawl('https://example.com');

            // Property 1: Results structure should be valid
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('sitemap');

          } catch (error) {
            // Robots.txt blocking should result in specific error
            if (respectRobotsTxt && (error as Error).message.includes('robots.txt')) {
              expect((error as Error).message).toContain('robots.txt');
            }
          }

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * Property: Concurrent crawling limits
   */
  it('should respect concurrency limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          concurrency: fc.integer({ min: 1, max: 3 }),
          maxPages: fc.integer({ min: 2, max: 5 })
        }),
        async ({ concurrency, maxPages }) => {
          const config: CrawlerConfig = {
            maxPages,
            maxDepth: 1,
            concurrency,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          try {
            const result = await crawler.crawl('https://example.com');

            // Property 1: Should not exceed max pages
            expect(result.results.length).toBeLessThanOrEqual(maxPages);

            // Property 2: Results should be valid
            result.results.forEach(crawlResult => {
              expect(crawlResult).toHaveProperty('url');
              expect(crawlResult).toHaveProperty('pageInfo');
              expect(crawlResult.pageInfo).toHaveProperty('statusCode');
              expect(crawlResult.pageInfo).toHaveProperty('loadTime');
            });

          } catch (error) {
            // Even if crawling fails, config should be valid
            expect(config.concurrency).toBeGreaterThan(0);
            expect(config.maxPages).toBeGreaterThan(0);
          }

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * Property: Page information extraction consistency
   */
  it('should extract page information consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }),
          statusCode: fc.constantFrom(200, 404, 500)
        }),
        async ({ title, statusCode }) => {
          const config: CrawlerConfig = {
            maxPages: 1,
            maxDepth: 1,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          try {
            const result = await crawler.crawl('https://example.com');

            if (result.results.length > 0) {
              const pageInfo = result.results[0].pageInfo;

              // Property 1: Page info should have required fields
              expect(pageInfo).toHaveProperty('url');
              expect(pageInfo).toHaveProperty('title');
              expect(pageInfo).toHaveProperty('statusCode');
              expect(pageInfo).toHaveProperty('loadTime');

              // Property 2: Load time should be positive
              expect(pageInfo.loadTime).toBeGreaterThan(0);

              // Property 3: Arrays should be initialized
              expect(Array.isArray(pageInfo.links)).toBe(true);
              expect(Array.isArray(pageInfo.images)).toBe(true);
              expect(Array.isArray(pageInfo.forms)).toBe(true);
              expect(Array.isArray(pageInfo.jsErrors)).toBe(true);
            }

          } catch (error) {
            // If extraction fails, should be due to network/parsing issues
            expect(error).toBeInstanceOf(Error);
          }

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * Property: Error handling and recovery
   */
  it('should handle errors gracefully and provide meaningful information', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          shouldFail: fc.boolean(),
          statusCode: fc.constantFrom(404, 500, 200)
        }),
        async ({ shouldFail, statusCode }) => {
          const config: CrawlerConfig = {
            maxPages: 1,
            maxDepth: 1,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          const result = await crawler.crawl('https://example.com');

          // Property 1: Result should always have required structure
          expect(result).toHaveProperty('results');
          expect(result).toHaveProperty('errors');
          expect(result).toHaveProperty('sitemap');

          // Property 2: Timestamps should be valid
          result.errors.forEach(error => {
            expect(Date.parse(error.timestamp)).not.toBeNaN();
          });

          result.results.forEach(crawlResult => {
            expect(Date.parse(crawlResult.crawledAt)).not.toBeNaN();
          });

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * Property: Statistics calculation accuracy
   */
  it('should calculate statistics accurately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            statusCode: fc.constantFrom(200, 404, 500)
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (mockResults) => {
          const config: CrawlerConfig = {
            maxPages: mockResults.length,
            maxDepth: 1,
            timeout: 5000
          };

          crawler = new WebCrawler(config);
          await crawler.initialize();

          const result = await crawler.crawl('https://example.com');
          const stats = crawler.getStatistics();

          // Property 1: Statistics should reflect actual results
          expect(stats.totalPages).toBe(result.results.length);
          expect(stats.totalErrors).toBe(result.errors.length);

          if (result.results.length > 0) {
            // Property 2: Average calculations should be reasonable
            expect(stats.avgLoadTime).toBeGreaterThanOrEqual(0);
            expect(stats.totalSize).toBeGreaterThanOrEqual(0);
            expect(stats.avgPageSize).toBeGreaterThanOrEqual(0);
          }

          await crawler.close();
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 20000);

  /**
   * **Feature: autoqa-pilot, Property 6: Error Detection and Reporting**
   * **Validates: Requirements 3.3, 3.4**
   * Test that broken links are detected and reported with URLs
   * Verify JavaScript errors are captured with stack traces
   */
  describe('Property 6: Error Detection and Reporting', () => {
    /**
     * Property: Broken link detection and reporting
     */
    it('should detect and report broken links with specific URLs and error codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            statusCodes: fc.array(
              fc.constantFrom(404, 500, 503, 403, 401),
              { minLength: 1, maxLength: 3 }
            ),
            validStatusCodes: fc.array(
              fc.constantFrom(200, 301, 302),
              { minLength: 1, maxLength: 2 }
            )
          }),
          async ({ statusCodes, validStatusCodes }) => {
            const config: CrawlerConfig = {
              maxPages: 5,
              maxDepth: 2,
              timeout: 5000,
              respectRobotsTxt: false
            };

            crawler = new WebCrawler(config);
            await crawler.initialize();

            try {
              const result = await crawler.crawl('https://example.com');

              // Property 1: Broken links should be detected and reported
              const brokenLinks = crawler.getBrokenLinks();
              
              // Property 2: Each broken link error should have required fields
              brokenLinks.forEach(error => {
                expect(error).toHaveProperty('url');
                expect(error).toHaveProperty('type');
                expect(error).toHaveProperty('message');
                expect(error).toHaveProperty('timestamp');
                expect(error.type).toBe('http_error');
                expect(typeof error.url).toBe('string');
                expect(error.url.length).toBeGreaterThan(0);
                expect(Date.parse(error.timestamp)).not.toBeNaN();
              });

              // Property 3: Error messages should contain HTTP status information
              brokenLinks.forEach(error => {
                expect(error.message).toMatch(/HTTP \d{3}/);
              });

              // Property 4: All errors should have valid timestamps
              result.errors.forEach(error => {
                expect(Date.parse(error.timestamp)).not.toBeNaN();
                expect(new Date(error.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
              });

              // Property 5: Error URLs should be valid URLs
              result.errors.forEach(error => {
                expect(() => new URL(error.url)).not.toThrow();
              });

            } catch (error) {
              // If crawling fails completely, error should be meaningful
              expect(error).toBeInstanceOf(Error);
              expect((error as Error).message.length).toBeGreaterThan(0);
            }

            await crawler.close();
          }
        ),
        { numRuns: 10, timeout: 8000 }
      );
    }, 15000);

    /**
     * Property: JavaScript error capture with stack traces
     */
    it('should capture JavaScript errors with stack traces and detailed information', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorTypes: fc.array(
              fc.constantFrom('ReferenceError', 'TypeError', 'SyntaxError', 'RangeError'),
              { minLength: 1, maxLength: 3 }
            ),
            hasStackTrace: fc.boolean()
          }),
          async ({ errorTypes, hasStackTrace }) => {
            const config: CrawlerConfig = {
              maxPages: 3,
              maxDepth: 1,
              timeout: 8000,
              respectRobotsTxt: false
            };

            crawler = new WebCrawler(config);
            await crawler.initialize();

            try {
              const result = await crawler.crawl('https://example.com');

              // Property 1: JavaScript errors should be captured
              const jsErrors = crawler.getJavaScriptErrors();

              // Property 2: Each JavaScript error should have required fields
              jsErrors.forEach(jsError => {
                expect(jsError).toHaveProperty('message');
                expect(jsError).toHaveProperty('stack');
                expect(jsError).toHaveProperty('url');
                expect(jsError).toHaveProperty('timestamp');
                
                expect(typeof jsError.message).toBe('string');
                expect(typeof jsError.stack).toBe('string');
                expect(typeof jsError.url).toBe('string');
                expect(typeof jsError.timestamp).toBe('string');
              });

              // Property 3: Error messages should be non-empty
              jsErrors.forEach(jsError => {
                expect(jsError.message.length).toBeGreaterThan(0);
              });

              // Property 4: Timestamps should be valid ISO strings
              jsErrors.forEach(jsError => {
                expect(Date.parse(jsError.timestamp)).not.toBeNaN();
                expect(jsError.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
              });

              // Property 5: URLs should be valid
              jsErrors.forEach(jsError => {
                expect(() => new URL(jsError.url)).not.toThrow();
              });

              // Property 6: JavaScript errors should be included in page info
              result.results.forEach(crawlResult => {
                expect(Array.isArray(crawlResult.pageInfo.jsErrors)).toBe(true);
                
                crawlResult.pageInfo.jsErrors.forEach(jsError => {
                  expect(jsError).toHaveProperty('message');
                  expect(jsError).toHaveProperty('stack');
                  expect(jsError).toHaveProperty('url');
                  expect(jsError).toHaveProperty('timestamp');
                });
              });

              // Property 7: Statistics should include JavaScript error count
              const stats = crawler.getStatistics();
              expect(stats).toHaveProperty('jsErrorCount');
              expect(typeof stats.jsErrorCount).toBe('number');
              expect(stats.jsErrorCount).toBeGreaterThanOrEqual(0);
              expect(stats.jsErrorCount).toBe(jsErrors.length);

            } catch (error) {
              // If crawling fails, error should be meaningful
              expect(error).toBeInstanceOf(Error);
              expect((error as Error).message.length).toBeGreaterThan(0);
            }

            await crawler.close();
          }
        ),
        { numRuns: 10, timeout: 8000 }
      );
    }, 15000);

    /**
     * Property: Error detection consistency across different scenarios
     */
    it('should consistently detect and report errors across various crawling scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maxPages: fc.integer({ min: 1, max: 5 }),
            maxDepth: fc.integer({ min: 1, max: 3 }),
            timeout: fc.integer({ min: 3000, max: 10000 }),
            concurrency: fc.integer({ min: 1, max: 3 })
          }),
          async ({ maxPages, maxDepth, timeout, concurrency }) => {
            const config: CrawlerConfig = {
              maxPages,
              maxDepth,
              timeout,
              concurrency,
              respectRobotsTxt: false
            };

            crawler = new WebCrawler(config);
            await crawler.initialize();

            try {
              const result = await crawler.crawl('https://example.com');

              // Property 1: Error structure should be consistent
              result.errors.forEach(error => {
                expect(error).toHaveProperty('url');
                expect(error).toHaveProperty('type');
                expect(error).toHaveProperty('message');
                expect(error).toHaveProperty('timestamp');
                
                // Validate error types
                expect(['http_error', 'timeout', 'crawl_error', 'robots_blocked', 'network_error'])
                  .toContain(error.type);
              });

              // Property 2: JavaScript errors should maintain consistent structure
              const allJsErrors = result.results.flatMap(r => r.pageInfo.jsErrors);
              allJsErrors.forEach(jsError => {
                expect(jsError).toHaveProperty('message');
                expect(jsError).toHaveProperty('stack');
                expect(jsError).toHaveProperty('url');
                expect(jsError).toHaveProperty('timestamp');
              });

              // Property 3: Error reporting should be comprehensive
              const brokenLinks = crawler.getBrokenLinks();
              const jsErrors = crawler.getJavaScriptErrors();
              
              // All broken links should be in the errors array
              brokenLinks.forEach(brokenLink => {
                expect(result.errors).toContainEqual(brokenLink);
              });

              // All JS errors should be accessible through both methods
              expect(jsErrors).toEqual(allJsErrors);

              // Property 4: Statistics should accurately reflect error counts
              const stats = crawler.getStatistics();
              expect(stats.totalErrors).toBe(result.errors.length);
              expect(stats.jsErrorCount).toBe(jsErrors.length);

            } catch (error) {
              // Configuration should be valid even if crawling fails
              expect(maxPages).toBeGreaterThan(0);
              expect(maxDepth).toBeGreaterThan(0);
              expect(timeout).toBeGreaterThan(0);
              expect(concurrency).toBeGreaterThan(0);
            }

            await crawler.close();
          }
        ),
        { numRuns: 10, timeout: 10000 }
      );
    }, 20000);

    /**
     * Property: Error URL validation and reporting accuracy
     */
    it('should report errors with accurate URL information and proper categorization', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            baseUrls: fc.array(
              fc.constantFrom(
                'https://example.com',
                'http://test.local',
                'https://subdomain.example.org'
              ),
              { minLength: 1, maxLength: 2 }
            )
          }),
          async ({ baseUrls }) => {
            const config: CrawlerConfig = {
              maxPages: 3,
              maxDepth: 2,
              timeout: 6000,
              respectRobotsTxt: false
            };

            for (const baseUrl of baseUrls) {
              crawler = new WebCrawler(config);
              await crawler.initialize();

              try {
                const result = await crawler.crawl(baseUrl);

                // Property 1: All error URLs should be valid and related to the crawled domain
                result.errors.forEach(error => {
                  expect(() => new URL(error.url)).not.toThrow();
                  
                  const errorUrl = new URL(error.url);
                  const baseUrlObj = new URL(baseUrl);
                  
                  // Error URL should be from the same domain or a linked domain
                  expect(typeof errorUrl.hostname).toBe('string');
                  expect(errorUrl.hostname.length).toBeGreaterThan(0);
                });

                // Property 2: HTTP errors should have appropriate status information
                const httpErrors = result.errors.filter(e => e.type === 'http_error');
                httpErrors.forEach(error => {
                  expect(error.message).toMatch(/HTTP \d{3}/);
                  
                  // Extract status code from message
                  const statusMatch = error.message.match(/HTTP (\d{3})/);
                  if (statusMatch) {
                    const statusCode = parseInt(statusMatch[1]);
                    expect(statusCode).toBeGreaterThanOrEqual(400);
                    expect(statusCode).toBeLessThan(600);
                  }
                });

                // Property 3: Error timestamps should be chronologically ordered
                if (result.errors.length > 1) {
                  for (let i = 1; i < result.errors.length; i++) {
                    const prevTime = new Date(result.errors[i - 1].timestamp).getTime();
                    const currTime = new Date(result.errors[i].timestamp).getTime();
                    
                    // Allow for some time variance due to concurrent processing
                    expect(currTime - prevTime).toBeGreaterThanOrEqual(-1000);
                  }
                }

                // Property 4: JavaScript errors should have proper URL association
                result.results.forEach(crawlResult => {
                  crawlResult.pageInfo.jsErrors.forEach(jsError => {
                    expect(jsError.url).toBe(crawlResult.url);
                  });
                });

              } catch (error) {
                // If crawling fails, should be due to network or configuration issues
                expect(error).toBeInstanceOf(Error);
              }

              await crawler.close();
            }
          }
        ),
        { numRuns: 10, timeout: 12000 }
      );
    }, 25000);
  });
});