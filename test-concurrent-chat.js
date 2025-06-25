/**
 * Test script for concurrent chat processing
 * This script simulates multiple users sending chat requests simultaneously
 */

const ConcurrentChatService = require('./src/services/concurrentChatService');
const { logger } = require('./src/utils/logger');

// Mock configuration for testing
const testConfig = {
  maxConcurrentChats: 3,
  chatTimeout: 30000,
  retryAttempts: 1,
  enableConcurrentProcessing: true,
  fallback: {
    enableFallback: true
  }
};

async function testConcurrentChat() {
  logger.info('Starting concurrent chat test...');
  
  const chatService = new ConcurrentChatService(testConfig);
  
  // Initialize the service
  await chatService.initialize();
  
  // Simulate multiple users sending messages simultaneously
  const testRequests = [
    {
      userId: 'user1',
      sessionId: 'session1',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
      systemPrompt: null,
      stream: false,
      onChunk: null
    },
    {
      userId: 'user2',
      sessionId: 'session2',
      model: 'llama3',
      messages: [{ role: 'user', content: 'What is the weather like?' }],
      systemPrompt: null,
      stream: false,
      onChunk: null
    },
    {
      userId: 'user3',
      sessionId: 'session3',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Tell me a joke' }],
      systemPrompt: null,
      stream: false,
      onChunk: null
    },
    {
      userId: 'user1',
      sessionId: 'session1',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Can you help me with coding?' }],
      systemPrompt: null,
      stream: false,
      onChunk: null
    },
    {
      userId: 'user4',
      sessionId: 'session4',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Explain quantum physics' }],
      systemPrompt: null,
      stream: false,
      onChunk: null
    }
  ];
  
  logger.info(`Sending ${testRequests.length} concurrent requests...`);
  
  const startTime = Date.now();
  
  // Send all requests concurrently
  const promises = testRequests.map((request, index) => {
    return chatService.processChatRequest(request)
      .then(result => {
        const endTime = Date.now();
        logger.info(`Request ${index + 1} (${request.userId}) completed in ${endTime - startTime}ms`);
        return { index: index + 1, userId: request.userId, success: true, result };
      })
      .catch(error => {
        const endTime = Date.now();
        logger.error(`Request ${index + 1} (${request.userId}) failed in ${endTime - startTime}ms:`, error.message);
        return { index: index + 1, userId: request.userId, success: false, error: error.message };
      });
  });
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  
  const totalTime = Date.now() - startTime;
  
  // Print results
  logger.info('\n=== Test Results ===');
  logger.info(`Total time: ${totalTime}ms`);
  logger.info(`Successful requests: ${results.filter(r => r.success).length}/${results.length}`);
  logger.info(`Failed requests: ${results.filter(r => !r.success).length}/${results.length}`);
  
  results.forEach(result => {
    if (result.success) {
      logger.info(`✅ Request ${result.index} (${result.userId}): SUCCESS`);
    } else {
      logger.error(`❌ Request ${result.index} (${result.userId}): FAILED - ${result.error}`);
    }
  });
  
  // Get service status
  const status = chatService.getStatus();
  logger.info('\n=== Service Status ===');
  logger.info(`Processing count: ${status.processingCount}`);
  logger.info(`Queue length: ${status.queueLength}`);
  logger.info(`Total requests: ${status.stats.totalRequests}`);
  logger.info(`Completed requests: ${status.stats.completedRequests}`);
  logger.info(`Failed requests: ${status.stats.failedRequests}`);
  logger.info(`Average processing time: ${status.stats.averageProcessingTime.toFixed(2)}ms`);
  logger.info(`Concurrent peak: ${status.stats.concurrentPeak}`);
  
  // Shutdown the service
  await chatService.shutdown();
  
  logger.info('\nConcurrent chat test completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testConcurrentChat().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testConcurrentChat };