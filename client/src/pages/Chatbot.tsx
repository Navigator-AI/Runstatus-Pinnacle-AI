import React, { useRef, useEffect, useState } from 'react';
import { animations } from '../components/chat/chatStyles';
import {
  ArrowPathIcon,
  PencilIcon,
  CheckIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { containsReadContextToolCall } from '../utils/toolParser';
import { useSidebar } from '../contexts/SidebarContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useToolExecution } from '../hooks/useToolExecution';
import ChatInput from '../components/chat/ChatInput';
import ChatSidebar from '../components/chat/ChatSidebar';
import MessageList from '../components/chat/MessageList';
import ModelSelector from '../components/chat/ModelSelector';
import MCPServerSelector from '../components/chat/MCPServerSelector';
import ContextReadingIndicator from '../components/chat/ContextReadingIndicator';
import MCPNotifications from '../components/mcp/MCPNotifications';
import { useMCP } from '../contexts/MCPContext';
import { useMCPAgent } from '../contexts/MCPAgentContext';
import { useChatSessions } from '../hooks/useChatSessions';
import { useConcurrentChatMessaging } from '../hooks/useConcurrentChatMessaging';
import { useContextHandling } from '../hooks/useContextHandling';
import { ExtendedChatMessage } from '../types';
import { chatbotService } from '../services/chatbotService';
import TrainingForm from '../components/TrainingForm'; // Added for predictor training form
import UserIcon from '../components/UserIcon';

const Chatbot: React.FC = () => {
  const { isExpanded: isMainSidebarExpanded } = useSidebar();

  // Use a ref to track if context rules have been loaded
  const contextRulesLoadedRef = useRef<{[key: string]: boolean}>({});
  
  // Get chat sessions functionality
  const {
    sessions,
    activeSessionId,
    sessionTitle,
    editingTitle,
    messages,
    loadingMessages,
    loadingSessions,
    hasMoreMessages,
    expandedGroups,
    showSidebar,
    setActiveSessionId,
    setSessionTitle,
    setEditingTitle,
    setMessages,
    fetchSessions,
    fetchSessionMessages,
    loadMoreMessages,
    createNewSession,
    deleteSession,
    updateSessionTitle,
    editSession,
    toggleSidebar,
    toggleGroup,
    resetChat
  } = useChatSessions();

  // Get concurrent concurrent chat messaging functionality
  const {
    isUploading,
    uploadProgress,
    setIsUploading,
    setUploadProgress,
    sendMessageToSession,
    stopSessionGeneration,
    getSessionLoading,
    getSessionStreaming,
    streamedContentRef,
    abortFunctionRef
  } = useConcurrentChatMessaging();

  // Get session-specific states
  const isLoading = activeSessionId ? getSessionLoading(activeSessionId) : false;
  const isStreaming = activeSessionId ? getSessionStreaming(activeSessionId) : false;

  // Create session-specific stop generation function
  const stopGeneration = () => {
    if (activeSessionId) {
      stopSessionGeneration(activeSessionId);
    }
  };

  // Create session-specific loading state setters for compatibility
  const setIsLoading = (loading: boolean) => {
    if (activeSessionId) {
      // Note: We don't have a direct setter in the concurrent hook
      // The loading state is managed internally by the hook
      console.log(`Setting loading state for session ${activeSessionId}: ${loading}`);
    }
  };

  const setIsStreaming = (streaming: boolean) => {
    if (activeSessionId) {
      // Note: We don't have a direct setter in the concurrent hook
      // The streaming state is managed internally by the hook
      console.log(`Setting streaming state for session ${activeSessionId}: ${streaming}`);
    }
  };

  // Get context handling functionality
  const {
    isRagAvailable,
    isRagEnabled,
    ragNotificationShown,
    setRagNotificationShown,
    checkForStoredContext,
    checkRagAvailability,
    forceCheckDocumentStatus,
    toggleRagMode,
    showRagAvailableNotification
  } = useContextHandling(activeSessionId);

  // Model selection state
  const [selectedModelId, setSelectedModelId] = React.useState<string | undefined>(() => {
    return localStorage.getItem('selectedModelId') || undefined;
  });

  // Get MCP functionality from the actual contexts
  const { isConnected: isMCPConnected, defaultServer, connectToServer } = useMCP();
  const { isAgentEnabled: isMCPEnabled, toggleAgent: toggleMCPEnabled } = useMCPAgent();
  
  // MCP Server selector state
  const [showServerSelector, setShowServerSelector] = useState(false);

  // Chat2SQL state - Added with persistence
  const [isChat2SqlEnabled, setIsChat2SqlEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('chat2sql_mode_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Predictor state - Added with persistence
  const [isPredictorEnabled, setIsPredictorEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('predictor_mode_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [isTraining, setIsTraining] = useState(false);

  // Helper functions for predictor message persistence
  const savePredictorMessage = (sessionId: string, message: ExtendedChatMessage) => {
    try {
      const key = `predictor_messages_${sessionId}`;
      const existing = localStorage.getItem(key);
      let messages = existing ? JSON.parse(existing) : [];
      
      // Add the new message
      messages.push({
        ...message,
        timestamp: message.timestamp.toISOString() // Convert Date to string for storage
      });
      
      // Keep only the last 50 messages per session to prevent localStorage bloat
      if (messages.length > 50) {
        messages = messages.slice(-50);
      }
      
      localStorage.setItem(key, JSON.stringify(messages));
      console.log('Predictor message saved to localStorage:', message.id);
    } catch (error) {
      console.error('Error saving predictor message to localStorage:', error);
    }
  };

  // Helper functions for Chat2SQL message persistence
  const saveChat2SqlMessage = (sessionId: string, message: ExtendedChatMessage) => {
    try {
      const key = `chat2sql_messages_${sessionId}`;
      const existing = localStorage.getItem(key);
      let messages = existing ? JSON.parse(existing) : [];
      
      // Add the new message
      messages.push({
        ...message,
        timestamp: message.timestamp.toISOString() // Convert Date to string for storage
      });
      
      // Keep only the last 50 messages per session to prevent localStorage bloat
      if (messages.length > 50) {
        messages = messages.slice(-50);
      }
      
      localStorage.setItem(key, JSON.stringify(messages));
      console.log('Chat2SQL message saved to localStorage:', message.id);
    } catch (error) {
      console.error('Error saving Chat2SQL message to localStorage:', error);
    }
  };

  const loadPredictorMessages = (sessionId: string): ExtendedChatMessage[] => {
    try {
      const key = `predictor_messages_${sessionId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const messages = JSON.parse(stored);
        return messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp) // Convert string back to Date
        }));
      }
    } catch (error) {
      console.error('Error loading predictor messages from localStorage:', error);
    }
    return [];
  };

  const loadChat2SqlMessages = (sessionId: string): ExtendedChatMessage[] => {
    try {
      const key = `chat2sql_messages_${sessionId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const messages = JSON.parse(stored);
        return messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp) // Convert string back to Date
        }));
      }
    } catch (error) {
      console.error('Error loading Chat2SQL messages from localStorage:', error);
    }
    return [];
  };

  const clearPredictorMessages = (sessionId: string) => {
    try {
      const key = `predictor_messages_${sessionId}`;
      localStorage.removeItem(key);
      console.log('Predictor messages cleared for session:', sessionId);
    } catch (error) {
      console.error('Error clearing predictor messages:', error);
    }
  };

  const clearChat2SqlMessages = (sessionId: string) => {
    try {
      const key = `chat2sql_messages_${sessionId}`;
      localStorage.removeItem(key);
      console.log('Chat2SQL messages cleared for session:', sessionId);
    } catch (error) {
      console.error('Error clearing Chat2SQL messages:', error);
    }
  };

  // Function to get session title based on active mode
  const getSessionTitleForMode = () => {
    if (isPredictorEnabled) return 'Predictor Chat';
    if (isChat2SqlEnabled) return 'Chat2SQL Session';
    if (isRagEnabled) return 'RAG Chat';
    if (isMCPEnabled) return 'MCP Chat';
    return 'New Chat';
  };

  // Enhanced MCP helper functions
  const selectServer = async (serverId: string) => {
    console.log('Selected MCP server:', serverId);
    
    try {
      setTimeout(() => {
        if (!isMCPEnabled) {
          toggleMCPEnabled();
        }
        setShowServerSelector(false);
      }, 3000);
    } catch (error) {
      console.error('Error in server selection:', error);
    }
  };

  const createContextToolMessage = () => {
    const contextMessage: ExtendedChatMessage = {
      id: `context-tool-${Date.now()}`,
      role: 'assistant',
      content: '? Reading context from uploaded documents...',
      timestamp: new Date(),
      isContextMessage: true
    };
    return contextMessage;
  };

  const handleMCPChatMessage = async (
    content: string,
    messages: ExtendedChatMessage[],
    activeSessionId: string | null,
    selectedModel: { id?: string },
    streamedContentRef: React.MutableRefObject<{ [key: string]: string }>,
    abortFunctionRef: React.MutableRefObject<{ [sessionId: string]: (() => void) | null }>,
    setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessage[]>>,
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
    executeTool: any,
    chatbotService: any,
    fetchSessions: () => void
  ) => {
    console.log('MCP Chat message handling:', content);
    throw new Error('MCP chat functionality not yet implemented');
  };

  // Tool execution state
  const { isExecutingTool, currentTool, executeTool } = useToolExecution();

  // Wrapper function to handle RAG toggle with mutual exclusion
  const handleToggleRag = () => {
    toggleRagMode(() => {
      // Disable other modes when enabling RAG
      if (!isRagEnabled) {
        // Disable MCP mode
        if (isMCPEnabled) {
          toggleMCPEnabled();
        }
        
        // Disable Chat2SQL mode
        if (isChat2SqlEnabled) {
          setIsChat2SqlEnabled(false);
          localStorage.setItem('chat2sql_mode_enabled', JSON.stringify(false));
        }
        
        // Disable Predictor mode
        if (isPredictorEnabled) {
          setIsPredictorEnabled(false);
          localStorage.setItem('predictor_mode_enabled', JSON.stringify(false));
        }
        
        // Auto-rename session if it's a new session or has default name
        if (activeSessionId && 
            (sessionTitle === 'New Chat' || 
             sessionTitle.startsWith('Chat') || 
             sessionTitle === 'Untitled' || 
             sessionTitle === 'MCP Chat' || 
             sessionTitle === 'Chat2SQL Session' || 
             sessionTitle === 'Predictor Chat')) {
          const newTitle = 'RAG Chat';
          setSessionTitle(newTitle);
          // Use setTimeout to ensure state update has completed
          setTimeout(() => {
            editSession(activeSessionId, newTitle);
          }, 100);
        }
      }
    });
  };

  // Wrapper function to handle MCP toggle with mutual exclusion
  const handleToggleMCPWithExclusion = () => {
    if (!isMCPEnabled && !isMCPConnected) {
      setShowServerSelector(true);
    } else {
      // If enabling MCP, disable other modes first
      if (!isMCPEnabled) {
        // Disable RAG mode
        if (isRagEnabled) {
          toggleRagMode();
        }
        
        // Disable Chat2SQL mode
        if (isChat2SqlEnabled) {
          setIsChat2SqlEnabled(false);
          localStorage.setItem('chat2sql_mode_enabled', JSON.stringify(false));
        }
        
        // Disable Predictor mode
        if (isPredictorEnabled) {
          setIsPredictorEnabled(false);
          localStorage.setItem('predictor_mode_enabled', JSON.stringify(false));
        }
        
        // Auto-rename session if it's a new session or has default name
        if (activeSessionId && 
            (sessionTitle === 'New Chat' || 
             sessionTitle.startsWith('Chat') || 
             sessionTitle === 'Untitled' || 
             sessionTitle === 'RAG Chat' || 
             sessionTitle === 'Chat2SQL Session' || 
             sessionTitle === 'Predictor Chat')) {
          const newTitle = 'MCP Chat';
          setSessionTitle(newTitle);
          // Use setTimeout to ensure state update has completed
          setTimeout(() => {
            editSession(activeSessionId, newTitle);
          }, 100);
        }
      }
      
      toggleMCPEnabled();
    }
  };

  // Toggle Chat2SQL mode
  const handleToggleChat2Sql = () => {
    setIsChat2SqlEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('chat2sql_mode_enabled', JSON.stringify(newValue));
        
        // If enabling Chat2SQL, disable other modes
        if (newValue) {
          // Disable RAG mode
          if (isRagEnabled) {
            toggleRagMode();
          }
          
          // Disable MCP mode
          if (isMCPEnabled) {
            toggleMCPEnabled();
          }
          
          // Disable Predictor mode
          if (isPredictorEnabled) {
            setIsPredictorEnabled(false);
            localStorage.setItem('predictor_mode_enabled', JSON.stringify(false));
          }
          
          // Auto-rename session if it's a new session or has default name
          if (activeSessionId && 
              (sessionTitle === 'New Chat' || 
               sessionTitle.startsWith('Chat') || 
               sessionTitle === 'Untitled' || 
               sessionTitle === 'RAG Chat' || 
               sessionTitle === 'MCP Chat' || 
               sessionTitle === 'Predictor Chat')) {
            const newTitle = 'Chat2SQL Session';
            setSessionTitle(newTitle);
            // Use setTimeout to ensure state update has completed
            setTimeout(() => {
              editSession(activeSessionId, newTitle);
            }, 100);
          }
        }
      } catch (error) {
        console.error('Error saving Chat2SQL mode to localStorage:', error);
      }
      return newValue;
    });
  };

  // Toggle Predictor mode
  const handleTogglePredictor = () => {
    setIsPredictorEnabled((prev) => {
      const newValue = !prev;
      try {
        localStorage.setItem('predictor_mode_enabled', JSON.stringify(newValue));
        
        // If enabling Predictor, disable other modes
        if (newValue) {
          // Disable RAG mode
          if (isRagEnabled) {
            toggleRagMode();
          }
          
          // Disable MCP mode
          if (isMCPEnabled) {
            toggleMCPEnabled();
          }
          
          // Disable Chat2SQL mode
          if (isChat2SqlEnabled) {
            setIsChat2SqlEnabled(false);
            localStorage.setItem('chat2sql_mode_enabled', JSON.stringify(false));
          }
          
          // Auto-rename session if it's a new session or has default name
          if (activeSessionId && 
              (sessionTitle === 'New Chat' || 
               sessionTitle.startsWith('Chat') || 
               sessionTitle === 'Untitled' || 
               sessionTitle === 'RAG Chat' || 
               sessionTitle === 'MCP Chat' || 
               sessionTitle === 'Chat2SQL Session')) {
            const newTitle = 'Predictor Chat';
            setSessionTitle(newTitle);
            // Use setTimeout to ensure state update has completed
            setTimeout(() => {
              editSession(activeSessionId, newTitle);
            }, 100);
          }
        }
      } catch (error) {
        console.error('Error saving predictor mode to localStorage:', error);
      }
      
      if (newValue) {
        // Send welcome message when predictor is activated
        const welcomeMessage = {
          id: `predictor-welcome-${Date.now()}`,
          role: 'assistant' as const,
          content: `🤖 **Predictor Mode Activated**

I'm ready to help you train models and make predictions with any tables in your database!

**Quick Commands:**
• \`train <place_table> <cts_table> <route_table>\` - Train with specific tables
• \`train\` - Open training form with available tables
• \`predict <place_table> <cts_table>\` - Generate predictions

**Examples:**
• \`train reg_place_csv reg_cts_csv reg_route_csv\`
• \`train ariane_place_sorted_csv ariane_cts_sorted_csv ariane_route_sorted_csv\`
• \`predict reg_place_csv reg_cts_csv\`

**Features:**
✅ Fully dynamic - works with any tables in algodb database
✅ Auto-detects available training sets
✅ Real-time validation and suggestions
✅ Fast training - optimized for speed
✅ Detailed performance metrics

What would you like to do?`,
          timestamp: new Date(),
          predictor: true,
          isServerResponse: true,
        };
        
        setMessages(prev => [...prev, welcomeMessage]);
      }
      setShowTrainingForm(false);
      return newValue;
    });
  };

  // Removed duplicate predictor message listener to prevent double responses

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Fetch sessions on component mount and ensure WebSocket connection
  useEffect(() => {
    fetchSessions();
    checkRagAvailability();
    forceCheckDocumentStatus(messages, setMessages, setIsLoading, setIsStreaming);
    
    if (activeSessionId) {
      if (contextRulesLoadedRef.current[activeSessionId]) {
        console.log('Context rules already loaded for session:', activeSessionId);
        return;
      }
      
      const contextRulesKey = `context_rules_${activeSessionId}`;
      try {
        let storedContextRules = sessionStorage.getItem(contextRulesKey) || localStorage.getItem(contextRulesKey);
        
        if (storedContextRules) {
          const parsedRules = JSON.parse(storedContextRules);
          
          if (parsedRules.hasContext && parsedRules.rules) {
            console.log('Found stored context rules for conversation:', activeSessionId);
            
            const systemContextMessage: ExtendedChatMessage = {
              id: `system-context-${Date.now()}`,
              role: 'system',
              content: `User context loaded: ${parsedRules.rules}`,
              timestamp: new Date(),
              isContextMessage: true
            };
            
            setMessages(prev => {
              const hasSimilarMessage = prev.some(msg => 
                msg.role === 'system' && 
                msg.content.includes('User context loaded:')
              );
              
              if (hasSimilarMessage) {
                console.log('Similar system message already exists, not adding another one');
                return prev;
              }

              return [...prev, systemContextMessage];
            });
            
            contextRulesLoadedRef.current[activeSessionId] = true;
          }
        }
      } catch (error) {
        console.error('Error checking for stored context rules:', error);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchSessionMessages(activeSessionId);
      const storedContext = checkForStoredContext(activeSessionId);
      if (storedContext) {
        console.log('Using stored context from localStorage:', storedContext);
      }
      
      const contextRulesKey = `context_rules_${activeSessionId}`;
      try {
        if (contextRulesLoadedRef.current[activeSessionId]) {
          console.log('Context rules already loaded for session:', activeSessionId);
          return;
        }
        
        let storedContextRules = sessionStorage.getItem(contextRulesKey) || localStorage.getItem(contextRulesKey);
        
        if (storedContextRules) {
          const parsedRules = JSON.parse(storedContextRules);
          
          if (parsedRules.hasContext && parsedRules.rules) {
            console.log('Found stored context rules for conversation:', activeSessionId);
            
            const systemContextMessage: ExtendedChatMessage = {
              id: `system-context-${Date.now()}`,
              role: 'system',
              content: `User context loaded: ${parsedRules.rules}`,
              timestamp: new Date(),
              isContextMessage: true
            };
            
            setTimeout(() => {
              setMessages(prev => {
                const hasSimilarMessage = prev.some(msg => 
                  msg.role === 'system' && 
                  msg.content.includes('User context loaded:')
                );
                
                if (hasSimilarMessage) {
                  console.log('Similar system message already exists, not adding another one');
                  return prev;
                }
                
                return [...prev, systemContextMessage];
              });
              
              contextRulesLoadedRef.current[activeSessionId] = true;
            }, 500);
          }
        }
      } catch (error) {
        console.error('Error checking for stored context rules:', error);
      }
    } else {
      setMessages(() => []);
    }
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for refreshMessages events
  useEffect(() => {
    const handleRefreshMessages = (event: CustomEvent<{ conversationId: string; source?: string }>) => {
      const { conversationId, source } = event.detail;

      if (source === 'context_tool') {
        console.log('Skipping refresh from context tool to prevent UI issues');
        return;
      }

      if (conversationId && conversationId === activeSessionId) {
        console.log('Refreshing messages for conversation:', conversationId);
        fetchSessionMessages(conversationId);
      }
    };

    window.addEventListener('refreshMessages', handleRefreshMessages as EventListener);

    const handleAddSystemMessage = (event: CustomEvent<{ message: ExtendedChatMessage }>) => {
      const { message } = event.detail;
      console.log('Adding system message to conversation:', message);
      
      setMessages(prev => {
        const hasSimilarMessage = prev.some(msg => 
          msg.role === 'system' && 
          msg.content.includes('User context loaded:')
        );
        
        if (hasSimilarMessage) {
          console.log('Similar system message already exists, replacing it');
          const updatedMessages = prev.map(msg => 
            (msg.role === 'system' && msg.content.includes('User context loaded:'))
              ? message
              : msg
          );
          
          const hasChanges = updatedMessages.some((msg, idx) => msg !== prev[idx]);
          if (!hasChanges) {
            console.log('No changes needed to system messages');
            return prev;
          }

          return updatedMessages;
        }
        
        return [...prev, message];
      });
    };
    
    window.addEventListener('addSystemMessage', handleAddSystemMessage as EventListener);

    return () => {
      window.removeEventListener('refreshMessages', handleRefreshMessages as EventListener);
      window.removeEventListener('addSystemMessage', handleAddSystemMessage as EventListener);
    };
  }, [activeSessionId, fetchSessionMessages]);

  // Load predictor messages when session changes
  useEffect(() => {
    if (activeSessionId && isPredictorEnabled) {
      console.log('Loading predictor messages for session:', activeSessionId);
      const predictorMessages = loadPredictorMessages(activeSessionId);
      if (predictorMessages.length > 0) {
        console.log(`Found ${predictorMessages.length} predictor messages in localStorage`);
        // Merge predictor messages with existing messages, avoiding duplicates
        setMessages(prev => {
          const existingIds = new Set(prev.map(msg => msg.id));
          const newMessages = predictorMessages.filter(msg => !existingIds.has(msg.id));
          return [...prev, ...newMessages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        });
      }
    }
  }, [activeSessionId, isPredictorEnabled]);

  // WebSocket reconnection
  const { connected: wsConnected, reconnect: wsReconnect } = useWebSocket();
  useEffect(() => {
    const periodicCheckInterval = setInterval(() => {
      if (!ragNotificationShown) {
        console.log('Performing periodic document status check');
        forceCheckDocumentStatus(messages, setMessages, setIsLoading, setIsStreaming);
        checkRagAvailability();
      }

      if (!wsConnected) {
        console.log('WebSocket not connected during periodic check, attempting to reconnect...');
        wsReconnect();
      }
    }, 30000);

    return () => {
      clearInterval(periodicCheckInterval);
    };
  }, [wsConnected, wsReconnect, ragNotificationShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
    }
  }, [editingTitle]);

  // Track processed message IDs to prevent duplicates
  const processedMessageIds = useRef(new Set<string>());

  const handleSendMessage = async (content: string, file?: File, meta?: any) => {
    // Only check for empty content, not global loading state
    if (content.trim() === '' && !file) return;
    
    // Get session-specific loading state
    const sessionId = activeSessionId || 'default-session';
    const isSessionLoading = getSessionLoading(sessionId);
    const isSessionStreaming = getSessionStreaming(sessionId);
    
    // Check for duplicate message processing
    if (meta?.id && processedMessageIds.current.has(meta.id)) {
      console.warn('🚨 [DUPLICATE DETECTED] Message already processed:', meta.id);
      return;
    }
    
    // Mark message as processed
    if (meta?.id) {
      processedMessageIds.current.add(meta.id);
      console.log('✅ [MESSAGE HANDLER] Marked message as processed:', meta.id);
      
      // Cleanup old message IDs to prevent memory leaks (keep last 100)
      if (processedMessageIds.current.size > 100) {
        const idsArray = Array.from(processedMessageIds.current);
        processedMessageIds.current = new Set(idsArray.slice(-50)); // Keep last 50
      }
    }

    console.log('🔍 [MESSAGE HANDLER] Processing message:', { content: content.substring(0, 100), meta });

    // Handle Predictor messages - Added
    if (isPredictorEnabled) {
      const trimmedContent = content.toLowerCase().trim();
      
      // Handle simple "train" command
      if (trimmedContent === 'train') {
        setShowTrainingForm(true);
        return;
      }
      
      // Training commands are now handled by ChatInput.tsx to avoid duplicate responses
      if (false && trimmedContent.startsWith('train ')) {
        console.log('Processing train command:', content);
        const parts = content.trim().split(/\s+/);
        if (parts.length >= 4) { // train + 3 table names
          const [, placeTable, ctsTable, routeTable] = parts;
          console.log('Parsed table names:', { placeTable, ctsTable, routeTable });
          
          // Prevent duplicate training requests
          if (isTraining) {
            console.log('Training already in progress, ignoring duplicate request');
            return;
          }
          
          // Create training start message
          const trainingStartMessage: ExtendedChatMessage = {
            id: `predictor-training-start-${Date.now()}`,
            role: 'assistant',
            content: `🔧 **Starting Model Training**

📊 **Training Configuration:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}
• Route table: ${routeTable}
• Model type: Neural Network (Route Slack Prediction)

⏳ Training in progress... This may take a few moments.`,
            timestamp: new Date(),
            predictor: true,
            isServerResponse: true,
          };
          
          setMessages(prev => [...prev, trainingStartMessage]);
          setIsTraining(true);
          
          // Start training with the provided table names
          console.log('Making API call to train with tables:', { placeTable, ctsTable, routeTable });
          try {
            const response = await fetch('http://127.0.0.1:8088/slack-prediction/train', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                place_table: placeTable,
                cts_table: ctsTable,
                route_table: routeTable,
              }),
            });

            const result = await response.json();

            if (!response.ok || result.status === 'error') {
              throw new Error(result.message || 'Failed to trigger training');
            }

            // Store training session info for future predictions
            try {
              const { default: predictorService } = await import('../services/predictorService');
              predictorService.setLastTrainingSession(placeTable, ctsTable, routeTable);
            } catch (error) {
              console.warn('Could not store training session info:', error);
            }

            // Create training completion message
            const trainingCompleteMessage: ExtendedChatMessage = {
              id: `predictor-training-complete-${Date.now()}`,
              role: 'assistant',
              content: result.message || `✅ **Training Completed Successfully!**

📊 **Training Configuration:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}
• Route table: ${routeTable}

🎯 **Next Steps:**
The model is now ready for predictions! Type "predict ${placeTable} ${ctsTable}" to generate route table predictions.`,
              timestamp: new Date(),
              predictor: true,
              isServerResponse: true,
            };
            
            setMessages(prev => [...prev, trainingCompleteMessage]);
            setIsTraining(false);
            
          } catch (error) {
            const errorMessage: ExtendedChatMessage = {
              id: `predictor-training-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Training Failed**

**Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}

Please check your table names and try again.`,
              timestamp: new Date(),
              predictor: true,
              isServerResponse: true,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
            
            setMessages(prev => [...prev, errorMessage]);
            setIsTraining(false);
          }
          
          return;
        } else if (parts.length === 2 || parts.length === 3) {
          // Handle incomplete train command
          const errorMessage: ExtendedChatMessage = {
            id: `predictor-train-help-${Date.now()}`,
            role: 'assistant',
            content: `❓ **Training Command Help**

To train the model, please provide all three table names:

**Format:** \`train <place_table> <cts_table> <route_table>\`

**Example:** \`train reg_place_csv reg_cts_csv reg_route_csv\`

Or simply type \`train\` to use the training form.`,
            timestamp: new Date(),
            predictor: true,
            isServerResponse: true,
          };
          
          setMessages(prev => [...prev, errorMessage]);
          return;
        }
      }
      
      // Prediction commands are now handled by ChatInput.tsx to avoid duplicate responses
      if (false && trimmedContent.startsWith('predict ')) {
        const parts = content.trim().split(/\s+/);
        if (parts.length >= 3) {
          // Two tables provided: place and CTS
          const placeTable = parts[1];
          const ctsTable = parts[2];
          
          // Validate that we're not using route tables as input
          if (placeTable.toLowerCase().includes('route') || ctsTable.toLowerCase().includes('route')) {
            const errorMessage: ExtendedChatMessage = {
              id: `predictor-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Prediction Error**

Cannot predict routes using route tables as input. 

**Correct Usage:**
• \`predict place_table cts_table\` - Predict route slack from place and CTS tables
• Example: \`predict reg_place_csv reg_cts_csv\`

**Invalid:**
• \`predict reg_route_csv\` - Cannot predict from route table
• \`predict reg_place_csv reg_route_csv\` - Cannot use route table as input`,
              timestamp: new Date(),
              predictor: true,
              error: "Invalid table types for prediction",
              isServerResponse: true,
            };
            
            setMessages(prev => [...prev, errorMessage]);
            return;
          }
        } else if (parts.length === 2) {
          // Single table provided - check if it's a route table (not allowed)
          const singleTable = parts[1];
          
          // Check if it's a route table (not allowed for prediction)
          if (singleTable.toLowerCase().includes('route')) {
            const errorMessage: ExtendedChatMessage = {
              id: `predictor-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Prediction Error**

Cannot predict from route tables. Route tables are outputs, not inputs.

**You provided:** \`predict ${singleTable}\`
**Issue:** Route tables cannot be used as input for predictions

**Correct Usage:**
• \`predict place_table cts_table\` - Both tables
• \`predict place_table\` - Place only (CTS will be synthetic)
• \`predict cts_table\` - CTS only (Place will be synthetic)

**Examples:**
• \`predict reg_place_csv reg_cts_csv\`
• \`predict reg_place_csv\`
• \`predict reg_cts_csv\``,
              timestamp: new Date(),
              predictor: true,
              error: "Route tables cannot be used as input",
              isServerResponse: true,
            };
            
            setMessages(prev => [...prev, errorMessage]);
            return;
          }
          
          // Single table prediction is allowed - proceed with the table
          const placeTable = singleTable.toLowerCase().includes('place') ? singleTable : undefined;
          const ctsTable = singleTable.toLowerCase().includes('cts') ? singleTable : undefined;
          
          // If table type is unclear, try to detect it
          let tableType = 'unknown';
          if (placeTable) tableType = 'place';
          else if (ctsTable) tableType = 'cts';
          else {
            // Try to detect based on common patterns
            if (singleTable.toLowerCase().includes('place') || singleTable.toLowerCase().includes('location') || singleTable.toLowerCase().includes('station')) {
              tableType = 'place';
            } else if (singleTable.toLowerCase().includes('cts') || singleTable.toLowerCase().includes('schedule') || singleTable.toLowerCase().includes('time')) {
              tableType = 'cts';
            }
          }
          
          // Create prediction start message for single table
          const predictionStartMessage: ExtendedChatMessage = {
            id: `predictor-prediction-start-${Date.now()}`,
            role: 'assistant',
            content: `🔮 **Generating Route Predictions**

📊 **Prediction Scenario:** Single Table (${tableType.toUpperCase()})
• Input table: ${singleTable}
• ${tableType === 'place' ? 'CTS' : 'Place'} table: Synthetic (generated automatically)

⚡ Processing data and generating route table predictions...`,
            timestamp: new Date(),
            predictor: true,
            isServerResponse: true,
          };
          
          setMessages(prev => [...prev, predictionStartMessage]);
          
          // Proceed with single table prediction
          const predictRequest: any = {};
          if (tableType === 'place') {
            predictRequest.place_table = singleTable;
          } else if (tableType === 'cts') {
            predictRequest.cts_table = singleTable;
          } else {
            // Default to place if unclear
            predictRequest.place_table = singleTable;
          }
          
          // Make actual prediction API call for single table
          try {
            const response = await fetch('http://127.0.0.1:8088/slack-prediction/predict', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(predictRequest),
            });

            const result = await response.json();

            if (!response.ok || result.status === 'error') {
              throw new Error(result.message || 'Failed to generate predictions');
            }

            const predictionCompleteMessage: ExtendedChatMessage = {
              id: `predictor-prediction-complete-${Date.now()}`,
              role: 'assistant',
              content: `✅ **Route Prediction Completed Successfully!**

🎯 **Generated Route Table**
📊 **Input Sources:**
• ${tableType === 'place' ? 'Place' : 'CTS'} table: ${singleTable} (real data)
• ${tableType === 'place' ? 'CTS' : 'Place'} table: Synthetic (AI-generated)

📈 **Prediction Results:**
• Total predictions: ${result.data?.length || 0}
• Model accuracy: ${result.metrics?.r2_score ? (result.metrics.r2_score * 100).toFixed(2) + '%' : 'N/A'}

The route table has been generated and is ready for download!`,
              timestamp: new Date(),
              predictor: true,
              isServerResponse: true,
              predictions: result.data,
            };

            setMessages(prev => [...prev, predictionCompleteMessage]);

          } catch (error) {
            console.error('Prediction error:', error);
            const errorMessage: ExtendedChatMessage = {
              id: `predictor-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Prediction Failed**

Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}

Please try again or check if the table exists and has the required columns.`,
              timestamp: new Date(),
              predictor: true,
              error: error instanceof Error ? error.message : 'Unknown error',
              isServerResponse: true,
            };

            setMessages(prev => [...prev, errorMessage]);
          }
          return;
        }
        
        if (parts.length >= 3) {
          const placeTable = parts[1];
          const ctsTable = parts[2];
          
          // Create prediction start message
          const predictionStartMessage: ExtendedChatMessage = {
            id: `predictor-prediction-start-${Date.now()}`,
            role: 'assistant',
            content: `🔮 **Generating Route Predictions**

📊 **Input Data:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}

⚡ Processing data and generating route table predictions...`,
            timestamp: new Date(),
            predictor: true,
            isServerResponse: true,
          };
          
          setMessages(prev => [...prev, predictionStartMessage]);
          
          // Make actual prediction API call
          try {
            // Tables are already provided directly - no need for derivation
            
            const response = await fetch('http://127.0.0.1:8088/slack-prediction/predict', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                place_table: placeTable,
                cts_table: ctsTable,
              }),
            });

            const result = await response.json();

            if (!response.ok || result.status === 'error') {
              throw new Error(result.message || 'Failed to generate predictions');
            }

            const predictionCompleteMessage: ExtendedChatMessage = {
              id: `predictor-prediction-complete-${Date.now()}`,
              role: 'assistant',
              content: `✅ **Route Prediction Completed Successfully!**

🎯 **Generated Route Table**
📊 **Input Sources:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}

📈 **Results:**
• Total predicted routes: ${result.total_predictions || 'N/A'}
• Preview: First 10 routes shown below
• Full table: Available for download

📊 **Model Performance:**
• R² Score: ${result.metrics?.r2_score?.toFixed(4) || 'N/A'} (${result.metrics?.r2_score ? (result.metrics.r2_score*100).toFixed(2) : 'N/A'}% accuracy)
• Mean Absolute Error: ${result.metrics?.mae?.toFixed(4) || 'N/A'}
• Mean Squared Error: ${result.metrics?.mse?.toFixed(4) || 'N/A'}

📋 **Route Table Preview (showing first 10 of ${result.total_predictions || 'N/A'} routes):**

🎯 **Predicted Route Table (${result.total_predictions || 'N/A'} routes)**

${result.data?.slice(0, 10).map((row: any, index: number) => 
  `${row.startpoint || 'N/A'} → ${row.endpoint || 'N/A'} | Place Slack: ${row.place_slack?.toFixed(4) || 'N/A'} | CTS Slack: ${row.cts_slack?.toFixed(4) || 'N/A'} | Predicted Route Slack: ${row.predicted_route_slack?.toFixed(4) || 'N/A'}`
).join('\n') || 'No preview data available'}

📊 Showing first 10 of ${result.total_predictions || 'N/A'} predictions (Download CSV for complete data)

**Download Complete Route Table (${result.total_predictions || 'N/A'} routes) as CSV**`,
              timestamp: new Date(),
              predictor: true,
              isServerResponse: true,
              showDownloadButton: true,
              predictions: result.data,
            };
            
            setMessages(prev => [...prev, predictionCompleteMessage]);
            
          } catch (error) {
            const errorMessage: ExtendedChatMessage = {
              id: `predictor-prediction-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Prediction Failed**

**Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}

Please ensure the model is trained first and the table names are correct.`,
              timestamp: new Date(),
              predictor: true,
              isServerResponse: true,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
            
            setMessages(prev => [...prev, errorMessage]);
          }
          
          return;
        }
      }
    }

    // Handle Predictor messages
    if (meta?.predictor) {
      console.log('🔍 [PREDICTOR HANDLER] Handling Predictor response in Chatbot.tsx...', meta);
      console.log('🔍 [PREDICTOR HANDLER] Message ID:', meta.id, 'Content length:', content.length);
      
      if (meta.isServerResponse) {
        const aiMessage: ExtendedChatMessage = {
          id: meta.id,
          role: 'assistant',
          content: meta.error ? `Error: ${meta.error}` : meta.content,
          timestamp: new Date(meta.timestamp),
          predictor: true,
          predictions: meta.predictions,
          error: meta.error,
          showDownloadButton: meta.showDownloadButton
        };
        
        console.log('✅ [AI MESSAGE] Adding predictor result message:', aiMessage);
        setMessages(prev => {
          // Ensure we don't duplicate AI messages
          const existingMessage = prev.find(msg => msg.id === aiMessage.id);
          if (existingMessage) {
            console.log('⚠️ [AI MESSAGE] Message already exists, skipping:', aiMessage.id);
            return prev;
          }
          return [...prev, aiMessage];
        });
        
        // Save predictor AI response to database and localStorage
        let sessionId = activeSessionId;
        if (!sessionId) {
          // Create a new session if none exists
          try {
            const newSession = await createNewSession('Predictor Session');
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            await fetchSessions(); // Refresh the sessions list
            console.log('Created new session for predictor:', sessionId);
          } catch (error) {
            console.error('Error creating new session for predictor:', error);
          }
        }
        
        if (sessionId) {
          try {
            await chatbotService.sendPredictorMessage(
              '', // Empty user message since this is AI response
              sessionId,
              meta.error ? `Error: ${meta.error}` : meta.content,
              {
                predictor: aiMessage.predictor,
                predictions: aiMessage.predictions,
                error: aiMessage.error,
                showDownloadButton: aiMessage.showDownloadButton,
                isServerResponse: aiMessage.isServerResponse
              }
            );
            console.log('Predictor AI message saved to database');
          } catch (error) {
            console.error('Error saving predictor AI message to database:', error);
          }
          savePredictorMessage(sessionId, aiMessage);
        }
        return;
      }
      
      if (meta.isUserCommand) {
        const userMessage: ExtendedChatMessage = {
          id: meta.id,
          role: 'user',
          content: content.trim(),
          timestamp: new Date(meta.timestamp),
          predictor: true,
          isUserCommand: true
        };

        console.log('✅ [USER MESSAGE] Adding user predictor command message:', userMessage);
        setMessages(prev => {
          // Ensure we don't duplicate user messages
          const existingMessage = prev.find(msg => msg.id === userMessage.id);
          if (existingMessage) {
            console.log('⚠️ [USER MESSAGE] Message already exists, skipping:', userMessage.id);
            return prev;
          }
          return [...prev, userMessage];
        });
        
        // Save predictor user command to database and localStorage
        let sessionId = activeSessionId;
        if (!sessionId) {
          // Create a new session if none exists
          try {
            const newSession = await createNewSession('Predictor Session');
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            await fetchSessions(); // Refresh the sessions list
            console.log('Created new session for predictor:', sessionId);
          } catch (error) {
            console.error('Error creating new session for predictor:', error);
          }
        }
        
        if (sessionId) {
          try {
            await chatbotService.sendPredictorMessage(
              content.trim(),
              sessionId,
              '', // Empty response since this is user message
              {
                isUserCommand: userMessage.isUserCommand
              }
            );
            console.log('Predictor user command saved to database');
          } catch (error) {
            console.error('Error saving predictor user command to database:', error);
          }
          savePredictorMessage(sessionId, userMessage);
        }
        return;
      }

      return;
    }

    // Handle Chat2SQL messages
    if (meta?.chat2sql) {
      console.log('🔍 [CHAT2SQL HANDLER] Handling Chat2SQL response in Chatbot.tsx...', meta);
      console.log('🔍 [CHAT2SQL HANDLER] Message ID:', meta.id, 'Content length:', content.length);
      
      if (meta.isServerResponse) {
        const aiMessage: ExtendedChatMessage = {
          id: meta.id,
          role: 'assistant',
          content: meta.error ? `Error: ${meta.error}` : meta.content,
          timestamp: new Date(meta.timestamp),
          isSqlResult: true,
          chat2sql: true
        };
        
        console.log('SQL result message:', aiMessage);
        setMessages(prev => [...prev, aiMessage]);
        
        // Save Chat2SQL AI message to localStorage
        if (activeSessionId) {
          saveChat2SqlMessage(activeSessionId, aiMessage);
        }
        
        // Save Chat2SQL AI response to database
        let sessionId = activeSessionId;
        if (!sessionId) {
          // Create a new session if none exists
          try {
            const newSession = await createNewSession('Chat2SQL Session');
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            await fetchSessions(); // Refresh the sessions list
            console.log('Created new session for Chat2SQL:', sessionId);
          } catch (error) {
            console.error('Error creating new session for Chat2SQL:', error);
          }
        }
        
        if (sessionId) {
          try {
            await chatbotService.sendPredictorMessage(
              '', // Empty user message since this is AI response
              sessionId,
              meta.error ? `Error: ${meta.error}` : meta.content,
              {
                chat2sql: true,
                isSqlResult: true,
                isServerResponse: true,
                error: meta.error
              }
            );
            console.log('Chat2SQL AI message saved to database');
          } catch (error) {
            console.error('Error saving Chat2SQL AI message to database:', error);
          }
        }
        return;
      }
      
      if (meta.isUserMessage) {
        const userMessage: ExtendedChatMessage = {
          id: meta.id || `user-${Date.now()}`,
          role: 'user',
          content: content.trim(),
          timestamp: new Date(),
          isSqlQuery: true,
          chat2sql: true
        };

        console.log('User SQL query message:', userMessage);
        setMessages(prev => [...prev, userMessage]);
        
        // Save Chat2SQL user message to localStorage
        if (activeSessionId) {
          saveChat2SqlMessage(activeSessionId, userMessage);
        }

        // Save Chat2SQL user message to database
        let sessionId = activeSessionId;
        if (!sessionId) {
          // Create a new session if none exists
          try {
            const newSession = await createNewSession('Chat2SQL Session');
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            await fetchSessions(); // Refresh the sessions list
            console.log('Created new session for Chat2SQL:', sessionId);
          } catch (error) {
            console.error('Error creating new session for Chat2SQL:', error);
          }
        }
        
        if (sessionId) {
          try {
            await chatbotService.sendPredictorMessage(
              content.trim(),
              sessionId,
              '', // Empty response since this is user message
              {
                chat2sql: true,
                isSqlQuery: true,
                isUserMessage: true
              }
            );
            console.log('Chat2SQL user message saved to database');
          } catch (error) {
            console.error('Error saving Chat2SQL user message to database:', error);
          }
        }

        return;
      }

      return;
    }

    // Special handling for read_context command
    if (content.trim().toLowerCase() === 'read_context') {
      console.log('Detected exact read_context command, triggering context tool directly');
      
      // Create user message for the command
      const userMessage: ExtendedChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Create AI response message
      const aiMessage = createContextToolMessage();
      setMessages(prev => [...prev, aiMessage]);
      
      // Save both messages to database
      let sessionId = activeSessionId;
      if (!sessionId) {
        try {
          const newSession = await createNewSession('Context Session');
          sessionId = newSession.id;
          setActiveSessionId(sessionId);
          await fetchSessions();
          console.log('Created new session for context:', sessionId);
        } catch (error) {
          console.error('Error creating new session for context:', error);
        }
      }
      
      if (sessionId) {
        try {
          await chatbotService.sendMessage(
            content.trim(),
            sessionId,
            aiMessage.content,
            false
          );
          console.log('Context command and response saved to database');
        } catch (error) {
          console.error('Error saving context messages to database:', error);
        }
      }
      
      return;
    }
    
    // Handle MCP messages
    if (isMCPEnabled && !file && content.trim() !== '') {
      try {
        const userMessage: ExtendedChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: content.trim(),
          timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);

        // Save MCP user message to database
        let sessionId = activeSessionId;
        if (!sessionId) {
          // Create a new session if none exists
          try {
            const newSession = await createNewSession('MCP Session');
            sessionId = newSession.id;
            setActiveSessionId(sessionId);
            await fetchSessions(); // Refresh the sessions list
            console.log('Created new session for MCP:', sessionId);
          } catch (error) {
            console.error('Error creating new session for MCP:', error);
          }
        }
        
        if (sessionId) {
          try {
            await chatbotService.sendMessage(
              content.trim(),
              sessionId,
              '', // Empty response since this is user message
              false
            );
            console.log('MCP user message saved to database');
          } catch (error) {
            console.error('Error saving MCP user message to database:', error);
          }
        }

        await handleMCPChatMessage(
          content,
          messages,
          activeSessionId,
          { id: selectedModelId },
          streamedContentRef,
          abortFunctionRef,
          setMessages,
          setIsStreaming,
          setIsLoading,
          executeTool,
          chatbotService,
          fetchSessions
        );
        return;
      } catch (error: any) {
        console.error('Error using MCP chat mode:', error);
        const errorMessage: ExtendedChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${error.message}. Falling back to normal chat.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        
        // Save MCP error message to database
        if (activeSessionId) {
          try {
            await chatbotService.sendMessage(
              '',
              activeSessionId,
              errorMessage.content,
              false
            );
            console.log('MCP error message saved to database');
          } catch (dbError) {
            console.error('Error saving MCP error message to database:', dbError);
          }
        }
      }
    }

    // Skip regular chat if predictor mode is enabled (predictor handles its own messages)
    if (isPredictorEnabled && !meta) {
      console.log('Predictor mode enabled but no meta data - skipping regular chat');
      return;
    }

    // Skip regular chat if this is a Chat2SQL message (Chat2SQL handles its own messages)
    if (meta?.chat2sql) {
      console.log('Chat2SQL message detected - skipping regular chat');
      return;
    }

    // Regular chat message handling
    if (!activeSessionId) {
      console.error('No active session ID for sending message');
      return;
    }

    const result = await sendMessageToSession(
      activeSessionId,
      content, 
      file, 
      messages, 
      selectedModelId, 
      isRagAvailable, 
      isRagEnabled, 
      setMessages, 
      fetchSessions
    );
    
    if (result?.newSessionId && (!activeSessionId || activeSessionId !== result.newSessionId)) {
      setActiveSessionId(result.newSessionId);
    }
  };



  const isEmpty = messages.length === 0;

  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      ${animations.bounce}
      ${animations.fadeIn}
      ${animations.slideIn}

      .input-area-blur {
        background-color: transparent !important;
        -webkit-backdrop-filter: blur(5px) !important;
        backdrop-filter: blur(5px) !important;
        border: none !important;
        box-shadow: none !important;
        isolation: isolate !important;
        opacity: 1 !important;
      }

      .input-area-blur > * {
        isolation: isolate !important;
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        backgroundColor: 'var(--color-bg)',
        left: isMainSidebarExpanded ? '64px' : '63px',
        width: isMainSidebarExpanded ? 'calc(100% - 64px)' : 'calc(100% - 50px)'
      }}
    >
      {/* MCP Server Selector */}
      <MCPServerSelector
        isOpen={showServerSelector}
        onClose={() => setShowServerSelector(false)}
        onServerSelect={selectServer}
      />
      <div
        className="px-4 py-3 flex items-center justify-between z-10 relative"
        style={{
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderRadius: '0 0 12px 12px'
        }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <UserIcon size={36} variant="default" />
            <h2
              className="text-base md:text-lg font-semibold truncate max-w-[200px] md:max-w-none"
              style={{ color: 'var(--color-text)' }}
            >
              {activeSessionId ? sessionTitle : 'New Chat'}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {isMCPEnabled && (
            <MCPNotifications />
          )}
          
          <ModelSelector
            onSelectModel={setSelectedModelId}
            selectedModelId={selectedModelId}
          />
          {!isEmpty && (
            <button
              onClick={() => resetChat()}
              className="p-2 rounded-full hover:bg-opacity-20 hover:bg-gray-500 transition-all hover:scale-105"
              style={{
                color: 'var(--color-text-muted)',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Clear current chat"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {showSidebar && (
          <div
            className="absolute md:relative h-full transition-all duration-300 ease-in-out z-20 md:z-0"
            style={{
              left: '0',
              width: window.innerWidth < 768 ? '100%' : '320px'
            }}
          >
            <ChatSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              expandedGroups={expandedGroups}
              loadingSessions={loadingSessions}
              isCollapsed={false}
              onCreateSession={createNewSession}
              onSelectSession={setActiveSessionId}
              onDeleteSession={deleteSession}
              onEditSession={editSession}
              onToggleGroup={toggleGroup}
              onToggleCollapse={toggleSidebar}
            />
          </div>
        )}

        {!showSidebar && (
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            expandedGroups={expandedGroups}
            loadingSessions={loadingSessions}
            isCollapsed={true}
            onCreateSession={createNewSession}
            onSelectSession={setActiveSessionId}
            onDeleteSession={deleteSession}
            onEditSession={editSession}
            onToggleGroup={toggleGroup}
            onToggleCollapse={toggleSidebar}
          />
        )}

        <div
          className={`absolute inset-0 transition-all duration-300 ease-in-out flex flex-col`}
          style={{
            backgroundColor: 'var(--color-bg)',
            marginLeft: showSidebar ? (window.innerWidth < 768 ? '0' : '320px') : '0'
          }}
        >
          {isExecutingTool && currentTool === 'read_context' && !messages.some(msg =>
            msg.role === 'assistant' && containsReadContextToolCall(msg.content)
          ) && (
            <div className="px-4 pt-2">
              <ContextReadingIndicator isReading={true} />
            </div>
          )}

          <MessageList
            messages={messages.filter(msg => msg.role !== 'system')}
            isLoading={isLoading}
            hasMoreMessages={hasMoreMessages}
            loadMoreMessages={loadMoreMessages}
            loadingMessages={loadingMessages}
            isEmpty={isEmpty}
            conversationId={activeSessionId || undefined}
          />

          {/* Training Form (shown when triggered) - Added */}
          {showTrainingForm && (
            <div className="px-4 py-2">
              <TrainingForm
                onTrainingComplete={() => setShowTrainingForm(false)}
              />
            </div>
          )}

          <div
            className={`${isEmpty ? "absolute left-1/2 bottom-[10%] transform -translate-x-1/2" : "absolute bottom-0 left-0 right-0"}
            ${!isEmpty && ""} py-4 px-4 md:px-8 lg:px-16 xl:px-24 input-area-blur`}
            style={{
              maxWidth: '100%',
              margin: '0 auto',
              zIndex: 10,
              boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
              backgroundColor: isEmpty ? 'transparent' : 'var(--color-bg-translucent)'
            }}
          >
            <ChatInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading} 
              isEmpty={isEmpty}
              isStreaming={isStreaming}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              onStopGeneration={stopGeneration}
              isRagAvailable={isRagAvailable}
              isRagEnabled={isRagEnabled}
              onToggleRag={handleToggleRag}
              sessionState={activeSessionId ? { 
                isLoading: getSessionLoading(activeSessionId), 
                isStreaming: getSessionStreaming(activeSessionId) 
              } : undefined}
              isMCPAvailable={isMCPConnected}
              isMCPEnabled={isMCPEnabled}
              onToggleMCP={handleToggleMCPWithExclusion}
              isChat2SqlEnabled={isChat2SqlEnabled}
              onToggleChat2Sql={handleToggleChat2Sql}
              // Added predictor props
              isPredictorEnabled={isPredictorEnabled}
              onTogglePredictor={handleTogglePredictor}
            />

            {isEmpty && (
              <div className="flex justify-center mt-12">
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => createNewSession()}
                    className="px-4 py-2 rounded-md text-sm flex items-center hover:bg-opacity-10 hover:bg-gray-500"
                    style={{
                      backgroundColor: 'var(--color-surface-dark)',
                      color: 'var(--color-text)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <PlusIcon className="h-4 w-4 mr-1.5" />
                    <span>New Chat</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;