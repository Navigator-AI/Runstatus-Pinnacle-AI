# Concurrent Chat Implementation

This document explains the concurrent chat processing implementation that allows multiple users to send chat messages simultaneously without blocking each other.

## Problem Solved

**Before**: Users had to wait for the AI to finish responding to one message before they could send another message. Multiple users couldn't chat simultaneously.

**After**: Users can send new messages while the AI is still responding to previous messages. Multiple users can chat concurrently without interfering with each other.

## Architecture

### Components

1. **ChatQueueManager** (`src/services/chatQueueManager.js`)
   - Manages a queue of chat requests
   - Processes multiple requests concurrently (configurable limit)
   - Handles request timeouts, retries, and cancellation
   - Provides statistics and monitoring

2. **ConcurrentChatService** (`src/services/concurrentChatService.js`)
   - Wrapper around ChatQueueManager and OllamaService
   - Provides backward compatibility with existing API
   - Handles fallback to sequential processing if needed

3. **Configuration** (`config/concurrent-chat.js`)
   - Configurable settings for concurrent processing
   - Environment variable support
   - Performance monitoring options

### Key Features

- **Concurrent Processing**: Up to 5 simultaneous chat requests by default
- **User Isolation**: Each user's requests are tracked separately
- **Request Cancellation**: Users can cancel their pending requests
- **Automatic Fallback**: Falls back to sequential processing if concurrent processing fails
- **Performance Monitoring**: Tracks processing times, queue lengths, and success rates
- **Configurable Limits**: Adjustable concurrent request limits and timeouts

## Configuration

### Environment Variables

```bash
# Maximum concurrent chat requests (default: 5)
MAX_CONCURRENT_CHATS=5

# Chat request timeout in milliseconds (default: 300000 = 5 minutes)
CHAT_TIMEOUT=300000

# Number of retry attempts (default: 2)
CHAT_RETRY_ATTEMPTS=2

# Enable/disable concurrent processing (default: true)
ENABLE_CONCURRENT_PROCESSING=true

# Maximum requests per user (default: 3)
MAX_CONCURRENT_PER_USER=3

# Rate limiting - requests per minute per user (default: 20)
REQUESTS_PER_MINUTE=20
```

### Configuration File

Edit `config/concurrent-chat.js` to customize settings:

```javascript
module.exports = {
  maxConcurrentChats: 5,
  chatTimeout: 300000,
  retryAttempts: 2,
  enableConcurrentProcessing: true,
  userLimits: {
    maxConcurrentPerUser: 3,
    requestsPerMinute: 20
  }
};
```

## API Endpoints

### Get Service Status
```
GET /api/ai/status
```
Returns current queue status, processing statistics, and performance metrics.

### Get User Requests
```
GET /api/ai/requests
```
Returns active chat requests for the current user.

### Cancel Request
```
DELETE /api/ai/requests/:requestId
```
Cancels a specific chat request.

### Cancel All User Requests
```
DELETE /api/ai/requests
```
Cancels all active requests for the current user.

## Client-Side Changes

### Key Modifications

1. **Removed Loading Blocks**: The chat input no longer disables when AI is responding
2. **Concurrent Streaming**: Multiple streaming responses can happen simultaneously
3. **Independent Sessions**: Each chat session operates independently

### Updated Components

- `useChatMessaging.ts`: Removed `isLoading` checks that blocked new messages
- `ChatInput.tsx`: Input remains enabled during AI responses
- `aiChatService.ts`: Supports concurrent streaming requests

## Usage Examples

### Basic Chat (Automatic)
The concurrent processing is enabled automatically. Users can:
1. Send a message
2. Immediately send another message while AI is responding
3. Continue chatting without waiting

### Multiple Users
Multiple users can chat simultaneously:
- User A sends a message → AI starts responding
- User B sends a message → AI processes both concurrently
- Both users receive responses independently

### Request Management
Users can manage their requests:
```javascript
// Get current requests
const requests = await fetch('/api/ai/requests').then(r => r.json());

// Cancel a specific request
await fetch(`/api/ai/requests/${requestId}`, { method: 'DELETE' });

// Cancel all requests
await fetch('/api/ai/requests', { method: 'DELETE' });
```

## Testing

### Manual Testing
1. Open multiple browser tabs/windows
2. Log in as different users (or same user)
3. Send messages simultaneously
4. Verify both conversations continue independently

### Automated Testing
Run the test script:
```bash
node test-concurrent-chat.js
```

This simulates 5 concurrent requests and shows processing statistics.

## Monitoring

### Service Status
Check `/api/ai/status` for:
- Current processing count
- Queue length
- Success/failure rates
- Average processing times
- Peak concurrent requests

### Logs
Monitor application logs for:
- Request queuing and processing
- Performance metrics
- Error handling
- Fallback usage

## Performance Considerations

### Memory Usage
- Each concurrent request uses memory
- Monitor memory usage with high concurrent loads
- Adjust `maxConcurrentChats` based on available resources

### CPU Usage
- More concurrent requests = higher CPU usage
- Balance concurrent limit with server capacity
- Consider model complexity and response times

### Network
- Streaming responses use persistent connections
- Monitor connection limits and bandwidth

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce `maxConcurrentChats`
   - Decrease `chatTimeout`
   - Monitor for memory leaks

2. **Slow Responses**
   - Check Ollama server performance
   - Reduce concurrent request limit
   - Increase timeout values

3. **Request Failures**
   - Check Ollama server connectivity
   - Review error logs
   - Verify model availability

### Fallback Mode
If concurrent processing fails, the system automatically falls back to sequential processing. Check logs for fallback usage.

### Disabling Concurrent Processing
Set `ENABLE_CONCURRENT_PROCESSING=false` to disable concurrent processing and use sequential mode.

## Future Enhancements

- **Load Balancing**: Distribute requests across multiple Ollama instances
- **Priority Queues**: Prioritize certain users or request types
- **Advanced Rate Limiting**: More sophisticated rate limiting algorithms
- **Caching**: Cache common responses to improve performance
- **Metrics Dashboard**: Web interface for monitoring performance

## Security Considerations

- **User Isolation**: Requests are isolated by user ID
- **Rate Limiting**: Prevents abuse with configurable limits
- **Request Validation**: All requests are validated before processing
- **Timeout Protection**: Prevents long-running requests from blocking resources