import { useState } from 'react';
import { ExtendedChatMessage, ChatSession } from '../types';
import { chatbotService } from '../services/chatbotService';
import { ragChatService } from '../services/ragChatService';

/**
 * Hook for managing chat sessions
 */
export const useChatSessions = () => {
  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  
  // Message state - keyed by session ID to prevent cross-session contamination
  const [messagesMap, setMessagesMap] = useState<{[sessionId: string]: ExtendedChatMessage[]}>({});
  
  // This provides backward compatibility but ensures messages are session-specific
  // Initialize with empty array or the active session's messages if available
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  
  // Modified setMessages to always update the session-specific messages
  const setMessagesWithSession = (updater: (prev: ExtendedChatMessage[]) => ExtendedChatMessage[]) => {
    // Only proceed if we have an active session
    if (!activeSessionId) {
      setMessages(updater([]));
      return;
    }
    
    // Update the messages for the specific session in the map
    setMessagesMap(prev => {
      const currentSessionMessages = prev[activeSessionId] || [];
      const newMessages = updater(currentSessionMessages);
      
      // Also update the compatibility messages state
      // This is the key change - only update messages for the active session
      if (activeSessionId) {
        setMessages(newMessages);
      }
      
      return {
        ...prev,
        [activeSessionId]: newMessages
      };
    });
  };
  
  // Helper function to update messages for a specific session
  const updateSessionMessages = (sessionId: string, messagesUpdater: (prev: ExtendedChatMessage[]) => ExtendedChatMessage[]) => {
    setMessagesMap(prev => {
      const currentSessionMessages = prev[sessionId] || [];
      const newMessages = messagesUpdater(currentSessionMessages);
      
      // If this is the active session, also update the messages state for compatibility
      // Only update if this is explicitly the active session
      if (sessionId === activeSessionId) {
        setMessages(newMessages);
      }
      
      return {
        ...prev,
        [sessionId]: newMessages
      };
    });
  };

  // Message loading state
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Today': true,
    'Yesterday': true,
    'Previous 7 Days': true,
    'Previous 30 Days': false,
    'Older': false
  });
  const [showSidebar, setShowSidebar] = useState(() => {
    const savedPreference = localStorage.getItem('chatSidebarExpanded');
    return savedPreference !== null ? savedPreference === 'true' : true;
  });

  // Enhanced setActiveSessionId function that updates messages
  const setActiveSessionIdWithMessages = (sessionId: string | null) => {
    // First, clear the messages from the previous session
    setMessages([]);
    
    // Then update the active session ID
    setActiveSessionId(sessionId);
    
    // If we have a valid session ID and messages in the map, update the current messages
    if (sessionId && messagesMap[sessionId]) {
      setMessages(messagesMap[sessionId]);
    } else if (sessionId) {
      // If we don't have messages for this session yet, make sure messages are empty
      setMessages([]);
    }
  };

  // Fetch all chat sessions
  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const fetchedSessions = await chatbotService.getSessions();
      setSessions(fetchedSessions);

      if (fetchedSessions.length > 0 && !activeSessionId) {
        const firstSessionId = fetchedSessions[0].id;
        setActiveSessionIdWithMessages(firstSessionId);
        setSessionTitle(fetchedSessions[0].title);
      }
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Fetch messages for a specific session
  const fetchSessionMessages = async (sessionId: string, append = false) => {
    if (!sessionId) {
      console.warn('fetchSessionMessages called with no sessionId');
      return;
    }
    
    try {
      setLoadingMessages(true);
      
      // Clear the current messages first if not appending to prevent flashing old content
      if (!append && sessionId === activeSessionId) {
        setMessages([]);
      }
      
      const offset = append ? messageOffset : 0;
      const response = await chatbotService.getSession(sessionId, 12, offset);

      const { messages: fetchedMessages, total } = response;
      setTotalMessages(total);
      setHasMoreMessages(offset + fetchedMessages.length < total);

      // Convert standard ChatMessage to ExtendedChatMessage and merge with predictor data
      const extendedMessages = fetchedMessages.map(msg => {
        const baseMessage = {
          ...msg,
          role: msg.role as 'user' | 'assistant' | 'system'
        };
        
        // Try to restore predictor data from localStorage
        try {
          const predictorKey = `predictor_messages_${sessionId}`;
          const predictorData = localStorage.getItem(predictorKey);
          if (predictorData) {
            const predictorMessages = JSON.parse(predictorData);
            
            // Try multiple matching strategies
            let matchingPredictorMsg = null;
            
            // Strategy 1: Exact content and close timestamp match
            matchingPredictorMsg = predictorMessages.find((pMsg: any) => 
              pMsg.content === msg.content && 
              Math.abs(new Date(pMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000 // 10 second tolerance
            );
            
            // Strategy 2: If no exact match, try matching by role and approximate timestamp
            if (!matchingPredictorMsg) {
              matchingPredictorMsg = predictorMessages.find((pMsg: any) => 
                pMsg.role === msg.role && 
                Math.abs(new Date(pMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 30000 && // 30 second tolerance
                (pMsg.predictor || pMsg.predictions || pMsg.isUserCommand) // Has predictor-specific data
              );
            }
            
            // Strategy 3: For predictor messages, try matching by content similarity
            if (!matchingPredictorMsg && msg.role === 'assistant') {
              matchingPredictorMsg = predictorMessages.find((pMsg: any) => 
                pMsg.role === 'assistant' && 
                pMsg.predictor && 
                (pMsg.content.includes('prediction') || pMsg.content.includes('route') || pMsg.content.includes('slack')) &&
                Math.abs(new Date(pMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000 // 1 minute tolerance
              );
            }
            
            if (matchingPredictorMsg) {
              console.log('Restored predictor data for message:', msg.id, matchingPredictorMsg);
              return {
                ...baseMessage,
                predictor: matchingPredictorMsg.predictor,
                predictions: matchingPredictorMsg.predictions,
                error: matchingPredictorMsg.error,
                showDownloadButton: matchingPredictorMsg.showDownloadButton,
                isUserCommand: matchingPredictorMsg.isUserCommand,
                isServerResponse: matchingPredictorMsg.isServerResponse
              };
            }
          }
        } catch (error) {
          console.error('Error restoring predictor data for message:', error);
        }

        // Try to restore Chat2SQL data from localStorage
        try {
          const chat2sqlKey = `chat2sql_messages_${sessionId}`;
          const chat2sqlData = localStorage.getItem(chat2sqlKey);
          if (chat2sqlData) {
            const chat2sqlMessages = JSON.parse(chat2sqlData);
            
            // Try multiple matching strategies for Chat2SQL messages
            let matchingChat2SqlMsg = null;
            
            // Strategy 1: Exact content and close timestamp match
            matchingChat2SqlMsg = chat2sqlMessages.find((cMsg: any) => 
              cMsg.content === msg.content && 
              Math.abs(new Date(cMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000 // 10 second tolerance
            );
            
            // Strategy 2: If no exact match, try matching by role and approximate timestamp
            if (!matchingChat2SqlMsg) {
              matchingChat2SqlMsg = chat2sqlMessages.find((cMsg: any) => 
                cMsg.role === msg.role && 
                Math.abs(new Date(cMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 30000 && // 30 second tolerance
                (cMsg.chat2sql || cMsg.isSqlResult || cMsg.isSqlQuery) // Has Chat2SQL-specific data
              );
            }
            
            // Strategy 3: For Chat2SQL messages, try matching by content similarity
            if (!matchingChat2SqlMsg) {
              matchingChat2SqlMsg = chat2sqlMessages.find((cMsg: any) => 
                cMsg.chat2sql && 
                Math.abs(new Date(cMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000 // 1 minute tolerance
              );
            }
            
            if (matchingChat2SqlMsg) {
              console.log('Restored Chat2SQL data for message:', msg.id, matchingChat2SqlMsg);
              return {
                ...baseMessage,
                chat2sql: matchingChat2SqlMsg.chat2sql,
                isSqlResult: matchingChat2SqlMsg.isSqlResult,
                isSqlQuery: matchingChat2SqlMsg.isSqlQuery,
                isUserMessage: matchingChat2SqlMsg.isUserMessage
              };
            }
          }
        } catch (error) {
          console.error('Error restoring Chat2SQL data for message:', error);
        }
        
        return baseMessage;
      });

      if (append) {
        // Update session-specific messages
        updateSessionMessages(sessionId, prev => [...extendedMessages, ...prev]);
        setMessageOffset(prev => prev + extendedMessages.length);
      } else {
        // Update session-specific messages
        updateSessionMessages(sessionId, () => extendedMessages);
        setMessageOffset(extendedMessages.length);
      }
      
      // Also update the active session's messages for compatibility
      // Only update if this is the active session to avoid cross-session contamination
      if (sessionId === activeSessionId) {
        if (append) {
          setMessages(prev => [...extendedMessages, ...prev]);
        } else {
          setMessages(extendedMessages);
        }
      }

      setSessionTitle(response.session.title);
    } catch (error) {
      console.error('Error fetching session messages:', error);
      // Ensure we clear messages on error to avoid showing stale data
      if (sessionId === activeSessionId) {
        setMessages([]);
      }
      updateSessionMessages(sessionId, () => []);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Load more messages for pagination
  const loadMoreMessages = async () => {
    if (!activeSessionId || !hasMoreMessages || loadingMessages) return;
    await fetchSessionMessages(activeSessionId, true);
  };

  // Create a new chat session
  const createNewSession = async (title?: string) => {
    try {
      const newSession = await chatbotService.createSession(title || 'New Chat');
      setSessions(prev => [newSession, ...prev]);
      
      // Initialize an empty message list for this new session
      setMessagesMap(prev => ({
        ...prev,
        [newSession.id]: []
      }));
      
      // Set active session ID using our enhanced function
      setActiveSessionIdWithMessages(newSession.id);
      setSessionTitle(newSession.title);
      setMessageOffset(0);
      setHasMoreMessages(false);
      setTotalMessages(0);
      return newSession; // Return the created session
    } catch (error) {
      console.error('Error creating new session:', error);
      throw error; // Re-throw the error so callers can handle it
    }
  };

  // Delete a chat session
  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      // Delete the chat session from the database
      await chatbotService.deleteSession(sessionId);

      // Also clear any RAG data associated with this session
      try {
        await ragChatService.clearRagData(sessionId);
        console.log('RAG data cleared for session:', sessionId);
      } catch (ragError) {
        console.error('Error clearing RAG data:', ragError);
        // Continue with session deletion even if RAG data clearing fails
      }

      // Update the UI
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (activeSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          setActiveSessionId(remainingSessions[0].id);
          setSessionTitle(remainingSessions[0].title);
        } else {
          setActiveSessionId(null);
          setSessionTitle('');
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  // Update session title
  const updateSessionTitle = async () => {
    if (!activeSessionId || !sessionTitle.trim()) return;

    try {
      await chatbotService.updateSession(activeSessionId, { title: sessionTitle });
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, title: sessionTitle } : s
      ));
      setEditingTitle(false);
    } catch (error) {
      console.error('Error updating session title:', error);
    }
  };

  // Edit any session title
  const editSession = async (sessionId: string, newTitle: string) => {
    try {
      await chatbotService.updateSession(sessionId, { title: newTitle });
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, title: newTitle } : s
      ));
      
      // Update the current session title if it's the active session
      if (sessionId === activeSessionId) {
        setSessionTitle(newTitle);
      }
    } catch (error) {
      console.error('Error editing session:', error);
    }
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setShowSidebar(prev => {
      const newValue = !prev;
      localStorage.setItem('chatSidebarExpanded', String(newValue));
      return newValue;
    });
  };

  // Toggle session group expansion
  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupLabel]: !prev[groupLabel]
    }));
  };

  // Clear current chat
  const resetChat = () => {
    if (confirm('Are you sure you want to clear the current chat?')) {
      setMessages(() => []);
    }
  };

  return {
    // State
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
    
    // Setters
    setActiveSessionId: setActiveSessionIdWithMessages, // Replace with enhanced version
    setSessionTitle,
    setEditingTitle,
    setMessages: setMessagesWithSession, // Replace with our session-aware function
    
    // Actions
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
  };
}; 