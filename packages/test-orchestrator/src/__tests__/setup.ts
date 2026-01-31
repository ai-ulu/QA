/**
 * Test setup for test-orchestrator package
 */

import { beforeAll, afterAll } from 'vitest';
import { logger } from '../utils/logger';

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Configure logger for tests
  logger.level = 'error'; // Reduce log noise during tests
  
  console.log('🚀 Test orchestrator tests starting...');
});

afterAll(async () => {
  console.log('✅ Test orchestrator tests completed');
});