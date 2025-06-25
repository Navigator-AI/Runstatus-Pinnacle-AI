import { useState, useRef, useCallback } from 'react';
import { ExtendedChatMessage } from '../types';
import { chatbotService } from '../services/chatbotService';
import { aiChatService, StreamChunk } from '../services/aiChatService';
import { ragChatService } from '../services/ragChatService';
import { getActiveOllamaModels } from '../services/ollamaService';
import { applyContextToPrompt } from '../utils/contextUtils';

// Session-specific state interface
interface SessionState {
  isLoading: boolean;
  isStreaming: boolean;
  streamingMessageId: string | null;
  abortFunction: (() => void) | null;
}

/**
 * Hook for managing concurrent chat messaging across multiple sessions
 * Each session maintains its own state and can process messages independently
 */
export const useConcurrentChatMessaging = () => {
  // Global upload state (shared across sessions)
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Session-specific states
  const [sessionStates, setSessionStates] = useState<{[sessionId: string]: SessionState}>({});
  
  // Refs for streaming content per session
  const streamedContentRef = useRef<{[messageId: string]: string}>({});
  const abortFunctionRef = useRef<{[sessionId: string]: (() => void) | null}>({});

  // Helper to get or create session state
  const getSessionState = useCallback((sessionId: string): SessionState => {
    return sessionStates[sessionId] || {
      isLoading: false,
      isStreaming: false,
      streamingMessageId: null,
      abortFunction: null
    };
  }, [sessionStates]);

  // Helper to update session state
  const updateSessionState = useCallback((sessionId: string, updates: Partial<SessionState>) => {
    setSessionStates(prev => ({
      ...prev,
      [sessionId]: {
        ...getSessionState(sessionId),
        ...updates
      }
    }));
  }, [getSessionState]);

  // Helper function to get the selected model details
  const getSelectedModelDetails = async (selectedModelId: string | undefined) => {
    try {
      if (!selectedModelId) {
        console.warn('No model selected, using default');

        // Try to get active models to find a default
        const modelsResponse = await getActiveOllamaModels();
        if (modelsResponse && modelsResponse.length > 0) {
          // Find the first active model
          const firstActiveModel = modelsResponse.find(model => model.is_active);
          if (firstActiveModel) {
            console.log('Using first active model as default:', firstActiveModel.name);
            return firstActiveModel;
          }
        }

        // If we couldn't find a model, create a placeholder with a default ID
        return {
          id: 'default',
          name: 'Default Model',
          model_id: 'default',
          ollama_model_id: process.env.DEFAULT_OLLAMA_MODEL || 'llama3',
          is_active: true,
          description: 'Default Model'
        };
      }

      const modelsResponse = await getActiveOllamaModels();
      const selectedModel = modelsResponse.find(model => model.id === selectedModelId);

      if (!selectedModel) {
        console.warn('Selected model not found, using default');

        // If the selected model is not found, use the first active model
        const firstActiveModel = modelsResponse.find(model => model.is_active);
        if (firstActiveModel) {
          return firstActiveModel;
        }

        // If no active models, create a placeholder
        return {
          id: 'default',
          name: 'Default Model',
          model_id: 'default',
          ollama_model_id: process.env.DEFAULT_OLLAMA_MODEL || 'llama3',
          is_active: true,
          description: 'Default Model'
        };
      }

      return selectedModel;
    } catch (error) {
      console.error('Error getting model details:', error);

      // Return a fallback model in case of error
      return {
        id: 'fallback',
        name: 'Fallback Model',
        model_id: 'fallback',
        ollama_model_id: process.env.DEFAULT_OLLAMA_MODEL || 'llama3',
        is_active: true,
        description: 'Fallback Model'
      };
    }
  };

  // Send a chat message (compatible with original interface)
  const sendChatMessage = async (
    content: string,
    file: File | undefined,
    messages: ExtendedChatMessage[],
    activeSessionId: string | null,
    selectedModelId: string | undefined,
    isRagAvailable: boolean,
    isRagEnabled: boolean,
    setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessage[]>>,
    fetchSessions: () => Promise<void>
  ) => {
    // Use a default session ID if none provided
    const sessionId = activeSessionId || 'default-session';
    
    // Check if this session is already processing a message
    const currentState = getSessionState(sessionId);
    
    // Even if this session is busy, we'll still add the user message
    // This allows typing in the chat even if the AI is responding
    if (currentState.isLoading || currentState.isStreaming) {
      console.log(`Session ${sessionId} is already processing a message, but we'll queue this new message`);
      // Continue processing - don't block other sessions
    }

    // Only basic validation - don't block on global states
    if (content.trim() === '' && !file) return;

    const tempId = `temp-${sessionId}-${Date.now()}`;
    
    // For file uploads, create a descriptive message if content is empty
    const displayContent = (file && content.trim() === '')
      ? `I'm uploading ${file.name} for analysis.`
      : content.trim();

    const userMessage: ExtendedChatMessage = {
      id: tempId,
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      // Add file metadata if a file is provided
      fileAttachment: file ? {
        name: file.name,
        type: file.type,
        size: file.size
      } : undefined
    };

    // Only update the messages for this specific session if it matches the active session
    if (activeSessionId && sessionId === activeSessionId) {
      setMessages(prev => [...prev, userMessage]);
    }
    
    // Update session state
    updateSessionState(sessionId, { isLoading: true });

    try {
      if (selectedModelId) {
        const selectedModel = await getSelectedModelDetails(selectedModelId);

        // Check if we should use RAG for this message
        const shouldUseRag = isRagAvailable && isRagEnabled;

        // Create a temporary AI message for streaming
        const aiMessageId = `ai-${sessionId}-${Date.now()}`;
        const aiMessage: ExtendedChatMessage = {
          id: aiMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true, // Mark as streaming to show the loading indicator
          useRag: shouldUseRag // Mark if we're using RAG
        };

        // Add the message to the UI immediately to show streaming
        // Only update the messages for this specific session if it matches the active session
        if (activeSessionId && sessionId === activeSessionId) {
          setMessages(prev => [...prev, aiMessage]);
        }
        updateSessionState(sessionId, { isStreaming: true, streamingMessageId: aiMessageId });

        // If RAG is available and enabled, use it
        if (shouldUseRag) {
          try {
            console.log(`Using RAG for session ${sessionId}`);

            // Call the RAG service
            const ragResponse = await ragChatService.sendRagChatMessage({
              model: selectedModel.ollama_model_id,
              message: content.trim(),
              sessionId: sessionId || undefined
            });

            // Update the message with the RAG response
            // Only update messages for this specific session
            if (activeSessionId) {
              setMessages(prev => prev.map(msg =>
                msg.id === aiMessageId ? {
                  ...msg,
                  content: ragResponse.content,
                  sources: ragResponse.sources,
                  isStreaming: false
                } : msg
              ));
            }

            // Save the message to the database
            const dbResponse = await chatbotService.sendMessage(
              content.trim(),
              sessionId || undefined,
              ragResponse.content
            );

            // Update the activeSessionId and fetch sessions if needed
            if (!activeSessionId || activeSessionId !== dbResponse.sessionId) {
              // We will return the new session ID to be set in the calling component
              const newSessionId = dbResponse.sessionId;
              await fetchSessions();
              
              // Return the new session ID
              return { success: true, newSessionId };
            }

            updateSessionState(sessionId, { isLoading: false, isStreaming: false });
            return { success: true };
          } catch (ragError) {
            console.error(`Error using RAG for session ${sessionId}:`, ragError);
            // Fall back to regular chat if RAG fails
            console.log(`Falling back to regular chat for session ${sessionId}`);

            // Update the message to indicate RAG failed
            // Only update messages for this specific session
            if (activeSessionId) {
              setMessages(prev => prev.map(msg =>
                msg.id === aiMessageId ? {
                  ...msg,
                  content: 'RAG processing failed, falling back to regular chat...',
                  useRag: false
                } : msg
              ));
            }
          }
        }

        // If we get here, either RAG is not available/enabled or it failed
        // Use regular chat with conversation history

        // Base system prompt
        let systemPromptContent = 'You are a helpful AI assistant. Answer the user\'s questions accurately and concisely.';

        // Apply context to the system prompt using our utility function with shell command capabilities
        systemPromptContent = applyContextToPrompt(systemPromptContent, messages, {
          enableShellCommands: true
        });

        // Log the system prompt with context for debugging
        console.log(`System prompt with context applied for session ${sessionId}:`, systemPromptContent);

        // Create conversation history with user and assistant messages
        const conversationHistory = messages
          .filter(msg => msg.role !== 'system' && !msg.content.startsWith('Context Loaded')) // Filter out system messages and context messages
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          }));

        // Add the current message to conversation history
        conversationHistory.push({ role: 'user', content: content.trim() });

        // Create the full conversation with system message
        const fullConversation = [
          { role: 'system' as 'user' | 'assistant' | 'system', content: systemPromptContent },
          ...conversationHistory
        ];

        // Set isStreaming to true to indicate we're waiting for a response
        updateSessionState(sessionId, { isStreaming: true, streamingMessageId: aiMessageId });
        
        // Set a safety timeout to ensure streaming state is eventually reset
        // This prevents the UI from being permanently frozen if something goes wrong
        const safetyTimeout = setTimeout(() => {
          console.log(`Safety timeout triggered for session ${sessionId}`);
          updateSessionState(sessionId, { 
            isStreaming: false, 
            isLoading: false,
            streamingMessageId: null,
            abortFunction: null
          });
        }, 60000); // 60 second timeout as a safety measure
        
        // Store the abort function so we can call it if the user clicks the stop button
        const abortFunction = await aiChatService.streamChatCompletion(
          {
            modelId: selectedModel.ollama_model_id,
            messages: fullConversation,
            options: { stream: true }
          },
          (chunk: StreamChunk) => {
            const newContent = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
            if (newContent) {
              // Update the ref with the accumulated content
              streamedContentRef.current[aiMessageId] = (streamedContentRef.current[aiMessageId] || '') + newContent;

              // Update the UI
              // Only update messages for this specific session and only if it matches the current active session
              if (activeSessionId && sessionId === activeSessionId) {
                setMessages(prev => prev.map(msg =>
                  msg.id === aiMessageId ? { ...msg, content: streamedContentRef.current[aiMessageId] } : msg
                ));
              }
            }
          },
          async () => {
            console.log(`Preparing to get final AI message content for session ${sessionId}`);
            
            // Clear the safety timeout since we've completed normally
            clearTimeout(safetyTimeout);

            // Add a small delay to ensure all content is accumulated
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
              // Double-check the final content after the delay
              const finalContentAfterDelay = streamedContentRef.current[aiMessageId] || '';
              console.log(`Final content after delay for session ${sessionId}:`, finalContentAfterDelay.length);

              // Save the message to the database
              const dbResponse = await chatbotService.sendMessage(
                content.trim(),
                activeSessionId || undefined,
                finalContentAfterDelay
              );
              console.log(`Database response for session ${sessionId}:`, dbResponse);

              // Update the activeSessionId and fetch sessions if needed
              if (!activeSessionId || activeSessionId !== dbResponse.sessionId) {
                // We will return the new session ID to be set in the calling component
                const newSessionId = dbResponse.sessionId;
                await fetchSessions();
                
                // Update the existing message with the database ID
                // Only update messages for this specific session
                if (activeSessionId) {
                  setMessages(prev => {
                    return prev.map(msg =>
                      msg.id === aiMessageId ? {
                        ...msg,
                        id: dbResponse.id,
                        isStreaming: false,
                        content: finalContentAfterDelay
                      } : msg
                    );
                  });
                }
                
                // Clean up the ref
                delete streamedContentRef.current[aiMessageId];
                
                // Return the new session ID
                updateSessionState(sessionId, { 
                  isLoading: false, 
                  isStreaming: false, 
                  abortFunction: null 
                });
                return { success: true, newSessionId };
              }

              // Update the existing message with the database ID
              // Only update messages for this specific session
              if (activeSessionId) {
                setMessages(prev => {
                  console.log(`Updating message with DB ID for session ${sessionId}:`, dbResponse.id);
                  return prev.map(msg =>
                    msg.id === aiMessageId ? {
                      ...msg,
                      id: dbResponse.id,
                      isStreaming: false,
                      content: finalContentAfterDelay
                    } : msg
                  );
                });
              }

              // Clean up the ref
              delete streamedContentRef.current[aiMessageId];
            } catch (error) {
              console.error(`Error saving message to database for session ${sessionId}:`, error);
              // Still mark the message as not streaming even if saving fails
              // Only update messages for this specific session
              if (activeSessionId) {
                setMessages(prev => prev.map(msg =>
                  msg.id === aiMessageId ? { ...msg, isStreaming: false } : msg
                ));
              }

              // Clean up the ref even on error
              delete streamedContentRef.current[aiMessageId];
            }

            updateSessionState(sessionId, { 
              isLoading: false, 
              isStreaming: false, 
              abortFunction: null 
            });
          },
          (error) => {
            console.error(`Streaming error for session ${sessionId}:`, error);
            
            // Clear the safety timeout since we're handling the error
            clearTimeout(safetyTimeout);
            
            setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
            
            // Always reset the session state on error to ensure the UI is responsive
            updateSessionState(sessionId, { 
              isLoading: false, 
              isStreaming: false, 
              abortFunction: null,
              streamingMessageId: null
            });
            
            // Clean up the ref on error
            delete streamedContentRef.current[aiMessageId];
            updateSessionState(sessionId, { 
              isLoading: false, 
              isStreaming: false, 
              abortFunction: null 
            });
          }
        );

        // Store the abort function for this session
        abortFunctionRef.current[sessionId] = abortFunction;
        updateSessionState(sessionId, { abortFunction });

      } else {
        // Fallback for when no model is selected
        const response = await chatbotService.sendMessage(userMessage.content, activeSessionId || undefined);
        
        // Return the new session ID if it changed
        if (!activeSessionId || activeSessionId !== response.sessionId) {
          await fetchSessions();
          return { success: true, newSessionId: response.sessionId };
        }

        updateSessionState(sessionId, { isLoading: false });
        return { success: true };
      }
    } catch (error) {
      console.error(`Error sending message for session ${sessionId}:`, error);
      updateSessionState(sessionId, { 
        isLoading: false, 
        isStreaming: false, 
        abortFunction: null 
      });
      return { success: false, error };
    }

    return { success: true };
  };

  // Stop generation (compatible with original interface)
  const stopGeneration = () => {
    // Stop all active sessions
    Object.keys(sessionStates).forEach(sessionId => {
      const sessionState = sessionStates[sessionId];
      if (sessionState.abortFunction) {
        sessionState.abortFunction();
        updateSessionState(sessionId, { 
          abortFunction: null, 
          isStreaming: false, 
          isLoading: false 
        });
      }
    });
    
    // Also check abortFunctionRef
    Object.keys(abortFunctionRef.current).forEach(sessionId => {
      const abortFn = abortFunctionRef.current[sessionId];
      if (abortFn) {
        abortFn();
        abortFunctionRef.current[sessionId] = null;
      }
    });
  };

  // Session-specific functions for the new interface
  const sendMessageToSession = async (
    sessionId: string,
    content: string,
    file: File | undefined,
    messages: ExtendedChatMessage[],
    selectedModelId: string | undefined,
    isRagAvailable: boolean,
    isRagEnabled: boolean,
    setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessage[]>>,
    fetchSessions: () => Promise<void>
  ) => {
    return sendChatMessage(content, file, messages, sessionId, selectedModelId, isRagAvailable, isRagEnabled, setMessages, fetchSessions);
  };

  const stopSessionGeneration = (sessionId: string) => {
    const sessionState = getSessionState(sessionId);
    if (sessionState.abortFunction) {
      sessionState.abortFunction();
      updateSessionState(sessionId, { 
        abortFunction: null, 
        isStreaming: false, 
        isLoading: false 
      });
    }
    
    const abortFn = abortFunctionRef.current[sessionId];
    if (abortFn) {
      abortFn();
      abortFunctionRef.current[sessionId] = null;
    }
  };

  const getSessionLoading = (sessionId: string) => {
    return getSessionState(sessionId).isLoading;
  };

  const getSessionStreaming = (sessionId: string) => {
    return getSessionState(sessionId).isStreaming;
  };

  // Get loading state (compatible with original interface)
  const isLoading = Object.values(sessionStates).some(state => state.isLoading);
  
  // Get streaming state (compatible with original interface)
  const isStreaming = Object.values(sessionStates).some(state => state.isStreaming);

  // Setters for compatibility (these will affect the current active session)
  const setIsLoading = (loading: boolean) => {
    // This is a compatibility function - in concurrent mode, loading is managed per session
    console.log(`Global setIsLoading called: ${loading}`);
  };

  const setIsStreaming = (streaming: boolean) => {
    // This is a compatibility function - in concurrent mode, streaming is managed per session
    console.log(`Global setIsStreaming called: ${streaming}`);
  };

  return {
    // Original interface compatibility
    isLoading,
    isStreaming,
    isUploading,
    uploadProgress,
    setIsLoading,
    setIsStreaming,
    streamedContentRef,
    abortFunctionRef,
    sendChatMessage,
    stopGeneration,
    
    // New concurrent interface
    sendMessageToSession,
    stopSessionGeneration,
    getSessionLoading,
    getSessionStreaming,
    setIsUploading,
    setUploadProgress,
    
    // Additional concurrent features
    getSessionState,
    sessionStates
  };
};