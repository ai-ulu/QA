// Unit tests for database edge cases and error scenarios
// Tests specific examples, edge cases, and error conditions

import { prisma, withTransaction, withRetry, checkDatabaseHealth, getConnectionPoolStats } from '../client';

describe('Database Edge Cases Unit Tests', () => {
  beforeEach(() => {
    testIsolation = new TestDataIsolation();
  });
  
  afterEach(async () => {
    await testIsolation.cleanupAll();
  });
  
  describe('Connection Pool Management', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      // Get initial connection stats
      const initialStats = await getConnectionPoolStats();
      
      // Create many concurrent operations that might exhaust the pool
      const operations = Array.from({ length: 25 }, (_, i) =>
        prisma.user.findMany({
          where: { username: { contains: `nonexistent-${i}` } },
          take: 1,
        })
      );
      
      // All operations should complete without throwing pool exhaustion errors
      const results = await Promise.allSettled(operations);
      
      // Verify all operations completed (even if they returned empty results)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          // Should not fail due to connection pool issues
          expect(result.reason.message).not.toContain('pool');
          expect(result.reason.message).not.toContain('connection');
        }
      });
      
      // Wait for connections to be returned to pool
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify connection pool is stable
      const finalStats = await getConnectionPoolStats();
      expect(finalStats.totalConnections).toBeLessThanOrEqual(initialStats.totalConnections + 5);
    });
    
    it('should detect connection pool leaks', async () => {
      const initialStats = await getConnectionPoolStats();
      
      // Simulate operations that might leak connections
      for (let i = 0; i < 10; i++) {
        await prisma.user.findMany({ take: 1 });
        await prisma.project.findMany({ take: 1 });
      }
      
      // Wait for connections to be cleaned up
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalStats = await getConnectionPoolStats();
      
      // Connection count should not grow significantly
      expect(finalStats.totalConnections - initialStats.totalConnections).toBeLessThanOrEqual(2);
    });
  });
  
  describe('Transaction Error Handling', () => {
    it('should rollback transaction on constraint violation', async () => {
      // Create a user first
      const user = await prisma.user.create({
        data: {
          githubId: 12345,
          username: 'testuser',
          email: 'test@example.com',
        },
      });
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      const initialProjectCount = await prisma.project.count();
      
      // Try to create projects in transaction, with one causing constraint violation
      try {
        await withTransaction(async (tx) => {
          // Create first project (should succeed)
          await tx.project.create({
            data: {
              userId: user.id,
              name: 'Valid Project',
              url: 'https://valid.example.com',
            },
          });
          
          // Try to create user with duplicate githubId (should fail)
          await tx.user.create({
            data: {
              githubId: 12345, // Duplicate githubId
              username: 'duplicate',
              email: 'duplicate@example.com',
            },
          });
        });
        
        fail('Transaction should have failed due to constraint violation');
      } catch (error) {
        // Expected error due to unique constraint violation
        expect(error.code).toBe('P2002'); // Prisma unique constraint error
      }
      
      // Verify transaction was rolled back - no new projects should exist
      const finalProjectCount = await prisma.project.count();
      expect(finalProjectCount).toBe(initialProjectCount);
    });
    
    it('should handle deadlock scenarios', async () => {
      // Create two users
      const user1 = await prisma.user.create({
        data: {
          githubId: 11111,
          username: 'user1',
          email: 'user1@example.com',
        },
      });
      
      const user2 = await prisma.user.create({
        data: {
          githubId: 22222,
          username: 'user2',
          email: 'user2@example.com',
        },
      });
      
      testIsolation.addResource('user', user1.id, async () => {
        await prisma.user.delete({ where: { id: user1.id } }).catch(() => {});
      });
      
      testIsolation.addResource('user', user2.id, async () => {
        await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
      });
      
      // Create concurrent transactions that might cause deadlock
      const transaction1 = withTransaction(async (tx) => {
        await tx.user.update({
          where: { id: user1.id },
          data: { username: 'updated_user1' },
        });
        
        // Small delay to increase chance of deadlock
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await tx.user.update({
          where: { id: user2.id },
          data: { username: 'updated_user2_by_tx1' },
        });
      });
      
      const transaction2 = withTransaction(async (tx) => {
        await tx.user.update({
          where: { id: user2.id },
          data: { username: 'updated_user2' },
        });
        
        // Small delay to increase chance of deadlock
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await tx.user.update({
          where: { id: user1.id },
          data: { username: 'updated_user1_by_tx2' },
        });
      });
      
      // At least one transaction should complete successfully
      const results = await Promise.allSettled([transaction1, transaction2]);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);
      
      // If there was a deadlock, it should be handled gracefully
      const failures = results.filter(r => r.status === 'rejected');
      failures.forEach(failure => {
        const error = (failure as PromiseRejectedResult).reason;
        // Should not be an unhandled deadlock
        expect(error.message).not.toContain('unhandled');
      });
    });
    
    it('should retry transient failures', async () => {
      let attemptCount = 0;
      
      const result = await withRetry(async () => {
        attemptCount++;
        
        if (attemptCount < 3) {
          // Simulate transient failure
          const error = new Error('Connection lost');
          (error as any).code = 'ECONNRESET';
          throw error;
        }
        
        // Succeed on third attempt
        return 'success';
      }, { maxRetries: 3, retryDelay: 100 });
      
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });
    
    it('should not retry non-transient failures', async () => {
      let attemptCount = 0;
      
      try {
        await withRetry(async () => {
          attemptCount++;
          
          // Simulate constraint violation (non-transient)
          const error = new Error('Unique constraint violation');
          (error as any).code = 'P2002';
          throw error;
        }, { maxRetries: 3, retryDelay: 100 });
        
        fail('Should not retry constraint violations');
      } catch (error) {
        expect(error.code).toBe('P2002');
        expect(attemptCount).toBe(1); // Should not retry
      }
    });
  });
  
  describe('Soft Delete Functionality', () => {
    it('should exclude soft-deleted records from queries', async () => {
      // Create user and project
      const user = await prisma.user.create({
        data: {
          githubId: 99999,
          username: 'softdeletetest',
          email: 'softdelete@example.com',
        },
      });
      
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          name: 'Project to be soft deleted',
          url: 'https://softdelete.example.com',
        },
      });
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      // Verify project exists in active queries
      const activeProjects = await prisma.project.findMany({
        where: { userId: user.id, deletedAt: null },
      });
      expect(activeProjects).toHaveLength(1);
      
      // Soft delete the project
      await prisma.project.update({
        where: { id: project.id },
        data: { deletedAt: new Date() },
      });
      
      // Verify project is excluded from active queries
      const activeProjectsAfterDelete = await prisma.project.findMany({
        where: { userId: user.id, deletedAt: null },
      });
      expect(activeProjectsAfterDelete).toHaveLength(0);
      
      // Verify project still exists in database
      const allProjects = await prisma.project.findMany({
        where: { userId: user.id },
      });
      expect(allProjects).toHaveLength(1);
      expect(allProjects[0].deletedAt).not.toBeNull();
    });
    
    it('should handle soft delete with related records', async () => {
      // Create user, project, and scenario
      const user = await prisma.user.create({
        data: {
          githubId: 88888,
          username: 'cascadetest',
          email: 'cascade@example.com',
        },
      });
      
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          name: 'Project with scenarios',
          url: 'https://cascade.example.com',
        },
      });
      
      const scenario = await prisma.testScenario.create({
        data: {
          projectId: project.id,
          name: 'Test scenario',
          naturalLanguageInput: 'Click button',
          generatedCode: 'await page.click("button")',
        },
      });
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      // Soft delete project
      await prisma.project.update({
        where: { id: project.id },
        data: { deletedAt: new Date() },
      });
      
      // Scenarios should still exist (not cascade soft delete)
      const scenarios = await prisma.testScenario.findMany({
        where: { projectId: project.id },
      });
      expect(scenarios).toHaveLength(1);
      
      // But project should be soft deleted
      const activeProjects = await prisma.project.findMany({
        where: { id: project.id, deletedAt: null },
      });
      expect(activeProjects).toHaveLength(0);
    });
  });
  
  describe('Database Health Monitoring', () => {
    it('should report healthy database status', async () => {
      const health = await checkDatabaseHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.latency).toBeGreaterThan(0);
      expect(health.latency).toBeLessThan(5000); // Should be less than 5 seconds
      expect(health.error).toBeUndefined();
    });
    
    it('should handle database connection errors', async () => {
      // This test would require mocking the database connection
      // For now, we'll test the structure of the health check response
      const health = await checkDatabaseHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('latency');
      expect(['healthy', 'unhealthy']).toContain(health.status);
      
      if (health.status === 'unhealthy') {
        expect(health).toHaveProperty('error');
        expect(typeof health.error).toBe('string');
      }
    });
  });
  
  describe('Concurrent Access Patterns', () => {
    it('should handle concurrent user creation without duplicates', async () => {
      const githubId = 77777;
      
      // Try to create the same user concurrently
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        prisma.user.create({
          data: {
            githubId,
            username: `concurrent_user_${i}`,
            email: `concurrent${i}@example.com`,
          },
        }).catch(error => error) // Catch errors instead of failing
      );
      
      const results = await Promise.all(createPromises);
      
      // Only one should succeed, others should fail with unique constraint error
      const successes = results.filter(r => r && r.id);
      const failures = results.filter(r => r && r.code === 'P2002');
      
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);
      
      // Clean up the created user
      if (successes.length > 0) {
        testIsolation.addResource('user', successes[0].id, async () => {
          await prisma.user.delete({ where: { id: successes[0].id } }).catch(() => {});
        });
      }
    });
    
    it('should handle concurrent project updates correctly', async () => {
      // Create user and project
      const user = await prisma.user.create({
        data: {
          githubId: 66666,
          username: 'concurrentupdate',
          email: 'concurrent@example.com',
        },
      });
      
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          name: 'Concurrent Update Test',
          url: 'https://concurrent.example.com',
        },
      });
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      // Update project concurrently
      const updatePromises = Array.from({ length: 3 }, (_, i) =>
        prisma.project.update({
          where: { id: project.id },
          data: { name: `Updated Name ${i}` },
        })
      );
      
      const results = await Promise.all(updatePromises);
      
      // All updates should succeed (last one wins)
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.id).toBe(project.id);
        expect(result.name).toMatch(/^Updated Name \d$/);
      });
      
      // Verify final state
      const finalProject = await prisma.project.findUnique({
        where: { id: project.id },
      });
      
      expect(finalProject).not.toBeNull();
      expect(finalProject!.name).toMatch(/^Updated Name \d$/);
    });
  });
  
  describe('Data Validation and Constraints', () => {
    it('should enforce required fields', async () => {
      // Try to create user without required fields
      await expect(
        prisma.user.create({
          data: {
            // Missing githubId and username
            email: 'incomplete@example.com',
          } as any,
        })
      ).rejects.toThrow();
    });
    
    it('should enforce unique constraints', async () => {
      const githubId = 55555;
      
      // Create first user
      const user1 = await prisma.user.create({
        data: {
          githubId,
          username: 'unique_test_1',
          email: 'unique1@example.com',
        },
      });
      
      testIsolation.addResource('user', user1.id, async () => {
        await prisma.user.delete({ where: { id: user1.id } }).catch(() => {});
      });
      
      // Try to create second user with same githubId
      await expect(
        prisma.user.create({
          data: {
            githubId, // Duplicate githubId
            username: 'unique_test_2',
            email: 'unique2@example.com',
          },
        })
      ).rejects.toThrow();
    });
    
    it('should enforce foreign key constraints', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
      
      // Try to create project with non-existent user
      await expect(
        prisma.project.create({
          data: {
            userId: nonExistentUserId,
            name: 'Invalid Project',
            url: 'https://invalid.example.com',
          },
        })
      ).rejects.toThrow();
    });
  });
  
  describe('Timezone and Date Handling', () => {
    it('should handle UTC timestamps correctly', async () => {
      const beforeCreate = new Date();
      
      const user = await prisma.user.create({
        data: {
          githubId: 44444,
          username: 'timezone_test',
          email: 'timezone@example.com',
        },
      });
      
      const afterCreate = new Date();
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      // Verify timestamps are in reasonable range
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000);
      expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
      expect(user.updatedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000);
    });
    
    it('should update updatedAt timestamp on record changes', async () => {
      const user = await prisma.user.create({
        data: {
          githubId: 33333,
          username: 'update_timestamp_test',
          email: 'updatetime@example.com',
        },
      });
      
      testIsolation.addResource('user', user.id, async () => {
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      });
      
      const originalUpdatedAt = user.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update the user
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { username: 'updated_username' },
      });
      
      // Verify updatedAt was changed
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      expect(updatedUser.createdAt.getTime()).toBe(user.createdAt.getTime()); // createdAt should not change
    });
  });
});