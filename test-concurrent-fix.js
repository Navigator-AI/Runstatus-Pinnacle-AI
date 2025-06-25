#!/usr/bin/env node

/**
 * Test script to verify concurrent chat functionality
 * This script simulates multiple users sending messages simultaneously
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  numConcurrentRequests: 5,
  delayBetweenRequests: 100, // ms
  testMessage: 'Hello, can you help me with a simple question?'
};

async function testConcurrentChats() {
  console.log('🚀 Starting concurrent chat test...');
  console.log(`📊 Configuration: ${TEST_CONFIG.numConcurrentRequests} concurrent requests`);
  
  const promises = [];
  const startTime = Date.now();
  
  // Create multiple concurrent requests
  for (let i = 0; i < TEST_CONFIG.numConcurrentRequests; i++) {
    const promise = testSingleChat(i + 1);
    promises.push(promise);
    
    // Small delay between starting requests to simulate real usage
    if (i < TEST_CONFIG.numConcurrentRequests - 1) {
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenRequests));
    }
  }
  
  console.log(`⏳ All ${TEST_CONFIG.numConcurrentRequests} requests started...`);
  
  try {
    const results = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log('\n✅ All requests completed!');
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(`📈 Average time per request: ${(totalTime / TEST_CONFIG.numConcurrentRequests).toFixed(2)}ms`);
    
    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Results Summary:`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed requests:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   Chat ${r.chatId}: ${r.error}`);
      });
    }
    
    // Check if requests were truly concurrent
    const responseTimes = results.filter(r => r.success).map(r => r.responseTime);
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);
    
    console.log(`\n⚡ Concurrency Analysis:`);
    console.log(`   Fastest response: ${minResponseTime}ms`);
    console.log(`   Slowest response: ${maxResponseTime}ms`);
    console.log(`   Time difference: ${maxResponseTime - minResponseTime}ms`);
    
    if (maxResponseTime - minResponseTime < totalTime * 0.5) {
      console.log('   🎉 Requests appear to be processed concurrently!');
    } else {
      console.log('   ⚠️  Requests may be processed sequentially');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testSingleChat(chatId) {
  const startTime = Date.now();
  
  try {
    console.log(`🔄 Chat ${chatId}: Starting request...`);
    
    // First, create a session
    const sessionResponse = await fetch(`${BASE_URL}/api/chatbot/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `connect.sid=test-session-${chatId}` // Simulate different sessions
      },
      body: JSON.stringify({
        title: `Test Chat ${chatId}`
      })
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.status}`);
    }
    
    const session = await sessionResponse.json();
    console.log(`📝 Chat ${chatId}: Session created (${session.id})`);
    
    // Send a message using the Ollama API (which supports concurrency)
    const messageResponse = await fetch(`${BASE_URL}/api/ollama/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `connect.sid=test-session-${chatId}`
      },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          {
            role: 'user',
            content: `${TEST_CONFIG.testMessage} (Chat ${chatId})`
          }
        ],
        options: {
          stream: false,
          sessionId: session.id,
          requestId: `test-${chatId}-${Date.now()}`
        }
      })
    });
    
    if (!messageResponse.ok) {
      throw new Error(`Failed to send message: ${messageResponse.status}`);
    }
    
    const response = await messageResponse.json();
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`✅ Chat ${chatId}: Response received in ${responseTime}ms`);
    
    return {
      chatId,
      success: true,
      responseTime,
      sessionId: session.id,
      responseLength: response.choices?.[0]?.message?.content?.length || 0
    };
    
  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`❌ Chat ${chatId}: Failed after ${responseTime}ms - ${error.message}`);
    
    return {
      chatId,
      success: false,
      responseTime,
      error: error.message
    };
  }
}

// Run the test
if (require.main === module) {
  testConcurrentChats()
    .then(() => {
      console.log('\n🏁 Test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testConcurrentChats, testSingleChat };