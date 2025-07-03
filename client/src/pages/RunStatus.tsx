import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PauseIcon,
  TableCellsIcon,
  UserIcon,
  CpuChipIcon,
  ShareIcon,
  CircleStackIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import runService from '../services/runService';
import userService from '../services/userService';
import flowtrackService, { DatabaseConnection, DatabaseFile, SimpleFlowAnalysisResult, BranchFlowAnalysisResult, RTLFlowAnalysisResult } from '../services/flowtrackService';
import runStatusDbService, { RunStatusTable, RunStatusDbStatus, SimpleFlowAnalysisResult as RunStatusSimpleFlowResult, BranchFlowAnalysisResult as RunStatusBranchFlowResult, RTLFlowAnalysisResult as RunStatusRTLFlowResult } from '../services/runStatusDbService';
import DatabaseConnectionModal from '../components/DatabaseConnectionModal';
import SimpleFlowVisualization from '../components/SimpleFlowVisualization';
import BranchFlowVisualization from '../components/BranchFlowVisualization';
import RTLFlowVisualization from '../components/RTLFlowVisualization';

// Types for our run data
interface RunStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'warning';
  startTime?: Date;
  endTime?: Date;
  logs?: string[];
  errorMessage?: string;
}

interface Run {
  id: string;
  name: string;
  userId: number;
  username: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  startTime: Date;
  endTime?: Date;
  steps: RunStep[];
  description?: string;
  type: string;
}

// Add user type
interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

export default function RunStatus() {
  const { user, isAdmin } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [selectedRunType, setSelectedRunType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'simple-flow' | 'branch-flow' | 'rtl-flow'>('simple-flow');
  
  // Database connection state (legacy - for manual connections)
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbConnection, setDbConnection] = useState<DatabaseConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dbFiles, setDbFiles] = useState<DatabaseFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DatabaseFile | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Automated Run Status database state
  const [runStatusTables, setRunStatusTables] = useState<RunStatusTable[]>([]);
  const [runStatusDbStatus, setRunStatusDbStatus] = useState<RunStatusDbStatus | null>(null);
  const [isRunStatusConnected, setIsRunStatusConnected] = useState(false);
  const [runStatusError, setRunStatusError] = useState<string | null>(null);
  const [selectedRunStatusTable, setSelectedRunStatusTable] = useState<RunStatusTable | null>(null);
  const [isRefreshingTables, setIsRefreshingTables] = useState(false);
  
  // Simple Flow related state
  const [simpleFlowData, setSimpleFlowData] = useState<SimpleFlowAnalysisResult | null>(null);
  const [isSimpleAnalyzing, setIsSimpleAnalyzing] = useState(false);
  
  // Branch Flow related state
  const [branchFlowData, setBranchFlowData] = useState<BranchFlowAnalysisResult | null>(null);
  const [isBranchAnalyzing, setIsBranchAnalyzing] = useState(false);

  // RTL Flow related state
  const [rtlFlowData, setRtlFlowData] = useState<RTLFlowAnalysisResult | null>(null);
  const [isRtlAnalyzing, setIsRtlAnalyzing] = useState(false);
  const [availableRtlFiles, setAvailableRtlFiles] = useState<DatabaseFile[]>([]);

  // Fetch users if admin
  useEffect(() => {
    const fetchUsers = async () => {
      if (isAdmin()) {
        try {
          const fetchedUsers = await userService.getUsers();
          setUsers(fetchedUsers);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      }
    };
    
    fetchUsers();
  }, [isAdmin]);

  // Fetch Run Status database status and tables
  useEffect(() => {
    const fetchRunStatusDb = async () => {
      try {
        console.log('Fetching Run Status database status...');
        const status = await runStatusDbService.getStatus();
        setRunStatusDbStatus(status);
        setIsRunStatusConnected(status.connection.isConnected);
        setRunStatusTables(status.tables);
        setRunStatusError(null);
        
        if (status.connection.isConnected) {
          console.log(`Connected to Run Status database with ${status.totalTables} tables`);
        } else {
          console.log('Run Status database not connected');
        }
      } catch (error: any) {
        console.error('Error fetching Run Status database status:', error);
        setRunStatusError(error.response?.data?.details || error.message || 'Failed to connect to Run Status database');
        setIsRunStatusConnected(false);
        setRunStatusTables([]);
      }
    };

    fetchRunStatusDb();

    // Set up polling to refresh tables every 30 seconds
    const interval = setInterval(fetchRunStatusDb, 30000);

    return () => clearInterval(interval);
  }, []);

  // Fetch runs data
  useEffect(() => {
    const fetchRuns = async () => {
      setLoading(true);
      try {
        let fetchedRuns: Run[] = [];
        
        if (isAdmin()) {
          if (selectedUserId) {
            fetchedRuns = await runService.getUserRuns(selectedUserId);
            const selectedUserData = users.find(u => u.id === selectedUserId) || null;
            setSelectedUser(selectedUserData);
          } else {
            fetchedRuns = await runService.getRuns();
            setSelectedUser(null);
          }
        } else if (user?.id) {
          fetchedRuns = await runService.getUserRuns(user.id);
        }
        
        setRuns(fetchedRuns);
      } catch (error) {
        console.error('Error fetching runs:', error);
        setRuns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [user, isAdmin, selectedUserId, users]);

  // Filter runs based on selected filters and search term
  const filteredRuns = runs.filter(run => {
    const matchesType = selectedRunType ? run.type === selectedRunType : true;
    const matchesStatus = selectedStatus ? run.status === selectedStatus : true;
    const matchesSearch = searchTerm 
      ? run.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        run.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        run.username.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    
    return matchesType && matchesStatus && matchesSearch;
  });

  const toggleRunExpansion = (runId: string) => {
    setExpandedRun(expandedRun === runId ? null : runId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5" style={{ color: 'var(--color-success)' }} />;
      case 'running':
        return <ArrowPathIcon className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />;
      case 'failed':
        return <XCircleIcon className="w-5 h-5" style={{ color: 'var(--color-error)' }} />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />;
      case 'paused':
        return <PauseIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />;
      default:
        return <ClockIcon className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />;
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const calculateDuration = (start?: Date, end?: Date) => {
    if (!start) return 'N/A';
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
  };

  // Database connection handlers
  const handleDatabaseConnect = async (connection: DatabaseConnection) => {
    setIsConnecting(true);
    setDbError(null);

    try {
      // Test connection first
      const connectionResult = await flowtrackService.testConnection(connection);
      
      if (connectionResult.success) {
        setDbConnection(connection);
        setIsConnected(true);

        // Fetch files from database
        const files = await flowtrackService.getFiles(connection);
        setDbFiles(files);
        setShowDbModal(false);
      } else {
        // Format error message with suggestions
        let errorMessage = connectionResult.error || 'Failed to connect to database';
        if (connectionResult.suggestions && connectionResult.suggestions.length > 0) {
          errorMessage += '\n\nSuggestions:\n' + connectionResult.suggestions.map(s => `• ${s}`).join('\n');
        }
        setDbError(errorMessage);
      }
    } catch (error: any) {
      console.error('Database connection error:', error);
      setDbError(error.response?.data?.details || error.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDatabaseDisconnect = () => {
    setDbConnection(null);
    setIsConnected(false);
    setDbFiles([]);
    setSelectedFile(null);
    setSimpleFlowData(null);
    setBranchFlowData(null);
    setRtlFlowData(null);
    setDbError(null);
    setIsSimpleAnalyzing(false);
    setIsBranchAnalyzing(false);
    setIsRtlAnalyzing(false);
  };

  const handleSimpleAnalyze = async (file: DatabaseFile) => {
    if (!dbConnection) return;
    
    setIsSimpleAnalyzing(true);
    setDbError(null);
    
    try {
      console.log('Starting simple analysis for file:', file.filename);
      const analysisResult = await flowtrackService.analyzeSimple(dbConnection, file.id);
      
      setSimpleFlowData(analysisResult);
      setSelectedFile(file);
    } catch (error: any) {
      console.error('Simple analysis error:', error);
      setDbError(error.response?.data?.details || error.message || 'Simple analysis failed');
    } finally {
      setIsSimpleAnalyzing(false);
    }
  };

  const handleBranchAnalyze = async (file: DatabaseFile) => {
    if (!dbConnection) return;
    
    setIsBranchAnalyzing(true);
    setDbError(null);
    
    try {
      console.log('Starting branch analysis for file:', file.filename);
      const analysisResult = await flowtrackService.analyzeBranch(dbConnection, file.id);
      
      setBranchFlowData(analysisResult);
      setSelectedFile(file);
    } catch (error: any) {
      console.error('Branch analysis error:', error);
      setDbError(error.response?.data?.details || error.message || 'Branch analysis failed');
    } finally {
      setIsBranchAnalyzing(false);
    }
  };

  const handleRtlAnalyze = async (file: DatabaseFile) => {
    if (!dbConnection) return;
    
    setIsRtlAnalyzing(true);
    setDbError(null);
    
    try {
      console.log('Starting RTL analysis for file:', file.filename);
      const analysisResult = await flowtrackService.analyzeRTL(dbConnection, file.id);
      
      setRtlFlowData(analysisResult);
      setSelectedFile(file);
    } catch (error: any) {
      console.error('RTL analysis error:', error);
      setDbError(error.response?.data?.details || error.message || 'RTL analysis failed');
    } finally {
      setIsRtlAnalyzing(false);
    }
  };

  const handleViewModeChange = (mode: 'simple-flow' | 'branch-flow' | 'rtl-flow') => {
    setViewMode(mode);
    
    // Clear previous analysis data when switching modes
    setSimpleFlowData(null);
    setBranchFlowData(null);
    setRtlFlowData(null);
    setSelectedRunStatusTable(null);
    
    // If switching to flow modes and no automated connection exists, show modal for manual connection
    if (!isRunStatusConnected && !dbConnection) {
      setShowDbModal(true);
    }
  };

  // Handle automated database table analysis
  const handleRunStatusSimpleAnalyze = async (table: RunStatusTable) => {
    setIsSimpleAnalyzing(true);
    setRunStatusError(null);
    
    try {
      console.log('Starting automated simple analysis for table:', table.table_name);
      const analysisResult = await runStatusDbService.analyzeSimple(table.table_name);
      
      console.log('Simple Flow Analysis Result:', analysisResult);
      console.log('Flow Data Structure:', analysisResult.flow_data);
      
      setSimpleFlowData(analysisResult as any); // Type compatibility
      setSelectedRunStatusTable(table);
    } catch (error: any) {
      console.error('Automated simple analysis error:', error);
      setRunStatusError(error.response?.data?.details || error.message || 'Simple analysis failed');
    } finally {
      setIsSimpleAnalyzing(false);
    }
  };

  const handleRunStatusBranchAnalyze = async (table: RunStatusTable) => {
    setIsBranchAnalyzing(true);
    setRunStatusError(null);
    
    try {
      console.log('Starting automated branch analysis for table:', table.table_name);
      const analysisResult = await runStatusDbService.analyzeBranch(table.table_name);
      
      setBranchFlowData(analysisResult as any); // Type compatibility
      setSelectedRunStatusTable(table);
    } catch (error: any) {
      console.error('Automated branch analysis error:', error);
      setRunStatusError(error.response?.data?.details || error.message || 'Branch analysis failed');
    } finally {
      setIsBranchAnalyzing(false);
    }
  };

  const handleRunStatusRtlAnalyze = async (table: RunStatusTable) => {
    setIsRtlAnalyzing(true);
    setRunStatusError(null);
    
    try {
      console.log('Starting automated RTL analysis for table:', table.table_name);
      const analysisResult = await runStatusDbService.analyzeRTL(table.table_name);
      
      setRtlFlowData(analysisResult as any); // Type compatibility
      setSelectedRunStatusTable(table);
    } catch (error: any) {
      console.error('Automated RTL analysis error:', error);
      setRunStatusError(error.response?.data?.details || error.message || 'RTL analysis failed');
    } finally {
      setIsRtlAnalyzing(false);
    }
  };

  // Handle manual refresh of automated database tables
  const handleRefreshRunStatusTables = async () => {
    setIsRefreshingTables(true);
    setRunStatusError(null);
    
    try {
      console.log('Manually refreshing Run Status database tables...');
      const result = await runStatusDbService.refreshTables();
      setRunStatusTables(result.tables);
      console.log(`Refreshed ${result.totalTables} tables`);
    } catch (error: any) {
      console.error('Error refreshing tables:', error);
      setRunStatusError(error.response?.data?.details || error.message || 'Failed to refresh tables');
    } finally {
      setIsRefreshingTables(false);
    }
  };

  // Filter dbFiles for RTL_version column when in RTL view and dbFiles change
  useEffect(() => {
    if (viewMode === 'rtl-flow' && dbFiles.length > 0) {
      // Only show tables that have RTL_version column (case insensitive)
      const filtered = dbFiles.filter(f =>
        Array.isArray(f.columns) && f.columns.some(col => 
          col.toLowerCase().replace('_', '').replace(' ', '') === 'rtlversion'
        )
      );
      setAvailableRtlFiles(filtered);
    } else {
      setAvailableRtlFiles([]);
    }
  }, [viewMode, dbFiles]);

  // Get RTL-compatible tables from automated database
  const getAvailableRtlTables = () => {
    if (viewMode === 'rtl-flow' && runStatusTables.length > 0) {
      return runStatusTables.filter(table =>
        Array.isArray(table.columns) && table.columns.some(col => 
          col.toLowerCase().replace('_', '').replace(' ', '') === 'rtlversion'
        )
      );
    }
    return [];
  };

  return (
    <div
      className="min-h-screen p-4 md:p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-dark) 100%)',
      }}
    >
      {/* Enhanced Background Pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'radial-gradient(circle at 25% 25%, var(--color-primary) 2px, transparent 2px), radial-gradient(circle at 75% 75%, var(--color-secondary) 1px, transparent 1px)',
        backgroundSize: '60px 60px, 40px 40px',
      }} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        {/* Enhanced Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="p-8 rounded-2xl backdrop-blur-md"
          style={{
            background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-dark) 100%)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 40px -10px var(--color-shadow), 0 10px 20px -5px var(--color-shadow-light)',
          }}
        >
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
          >
            {selectedUser ? `${selectedUser.name}'s Run Status` : 'Physical Design Run Status'}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{ color: 'var(--color-text-secondary)' }}
            className="text-lg"
          >
            {isAdmin() 
              ? selectedUser 
                ? `Viewing run status for ${selectedUser.name}`
                : 'Monitor and manage IC design runs across the platform' 
              : 'Track the status of your IC design runs'}
          </motion.p>
        </motion.div>

        {/* Enhanced User selection for admins */}
        {isAdmin() && users.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="p-6 rounded-2xl shadow-card border backdrop-blur-md" 
            style={{ 
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 25px 50px -12px var(--color-shadow)',
            }}
          >
            <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Select User</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <motion.div 
                whileHover={{ y: -8, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={() => setSelectedUserId(null)}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                  selectedUserId === null 
                    ? 'border-primary bg-primary-light shadow-lg' 
                    : 'hover:bg-surface-light hover:shadow-md'
                }`}
                style={{ 
                  borderColor: selectedUserId === null ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: selectedUserId === null ? 'var(--color-primary-10)' : 'var(--color-surface)',
                }}
              >
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                    backgroundColor: 'var(--color-primary-20)',
                    color: 'var(--color-primary)'
                  }}>
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div className="ml-4">
                    <div className="font-semibold" style={{ color: 'var(--color-text)' }}>All Users</div>
                    <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>View runs from all users</div>
                  </div>
                </div>
              </motion.div>
              
              {users.map((u, index) => (
                <motion.div 
                  key={u.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                    selectedUserId === u.id 
                      ? 'border-primary bg-primary-light shadow-lg' 
                      : 'hover:bg-surface-light hover:shadow-md'
                  }`}
                  style={{ 
                    borderColor: selectedUserId === u.id ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: selectedUserId === u.id ? 'var(--color-primary-10)' : 'var(--color-surface)',
                  }}
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{
                      backgroundColor: 'var(--color-primary-20)',
                      color: 'var(--color-primary)'
                    }}>
                      {u.name ? u.name.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="font-semibold" style={{ color: 'var(--color-text)' }}>{u.name || u.username}</div>
                      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{u.username}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Enhanced Flow View Selection */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="p-0 rounded-2xl shadow-card border overflow-hidden backdrop-blur-md" 
          style={{ 
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 25px 50px -12px var(--color-shadow)',
          }}
        >
          <div className="bg-gradient-to-r from-[var(--color-primary)] via-[var(--color-primary-dark)] to-[var(--color-secondary)] px-8 py-6">
            <div className="flex flex-col items-center text-center">
              <motion.h3 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="text-2xl font-bold text-white mb-2"
              >
                Flow Analysis Views
              </motion.h3>
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="text-white/80 mb-6"
              >
                Choose your preferred analysis method
              </motion.p>
              
              {/* Centered Flow View Buttons */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.0 }}
                className="flex justify-center items-center space-x-4"
              >
                <motion.button 
                  whileHover={{ scale: 1.08, y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={() => handleViewModeChange('simple-flow')}
                  className="flex items-center px-6 py-3 rounded-xl font-semibold transition-all duration-300"
                  style={{ 
                    backgroundColor: viewMode === 'simple-flow' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.15)',
                    color: viewMode === 'simple-flow' ? 'var(--color-primary)' : 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: viewMode === 'simple-flow' ? '0 8px 25px rgba(0, 0, 0, 0.15)' : '0 4px 15px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <ShareIcon className="w-5 h-5 mr-2" />
                  Simple Flow
                </motion.button>
                
                <motion.button 
                  whileHover={{ scale: 1.08, y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={() => handleViewModeChange('branch-flow')}
                  className="flex items-center px-6 py-3 rounded-xl font-semibold transition-all duration-300"
                  style={{ 
                    backgroundColor: viewMode === 'branch-flow' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.15)',
                    color: viewMode === 'branch-flow' ? 'var(--color-primary)' : 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: viewMode === 'branch-flow' ? '0 8px 25px rgba(0, 0, 0, 0.15)' : '0 4px 15px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <CircleStackIcon className="w-5 h-5 mr-2" />
                  Branch Flow
                </motion.button>
                
                <motion.button 
                  whileHover={{ scale: 1.08, y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={() => handleViewModeChange('rtl-flow')}
                  className="flex items-center px-6 py-3 rounded-xl font-semibold transition-all duration-300"
                  style={{ 
                    backgroundColor: viewMode === 'rtl-flow' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.15)',
                    color: viewMode === 'rtl-flow' ? 'var(--color-primary)' : 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: viewMode === 'rtl-flow' ? '0 8px 25px rgba(0, 0, 0, 0.15)' : '0 4px 15px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <CpuChipIcon className="w-5 h-5 mr-2" />
                  RTL View
                </motion.button>
              </motion.div>
            </div>
          </div>
          
          {/* Enhanced Filters Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 p-8"
          >
            <div>
              <label htmlFor="search" className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Search</label>
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search runs..."
                className="w-full rounded-xl px-4 py-3 transition-all duration-300 focus:ring-2 focus:ring-primary focus:border-transparent"
                style={{
                  backgroundColor: 'var(--color-surface-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  border: '2px solid var(--color-border)'
                }}
              />
            </div>
            <div>
              <label htmlFor="type" className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Run Type</label>
              <select
                id="type"
                value={selectedRunType || ''}
                onChange={(e) => setSelectedRunType(e.target.value || null)}
                className="w-full rounded-xl px-4 py-3 transition-all duration-300 focus:ring-2 focus:ring-primary focus:border-transparent"
                style={{
                  backgroundColor: 'var(--color-surface-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  border: '2px solid var(--color-border)'
                }}
              >
                <option value="">All Types</option>
                <option value="Timing">Timing</option>
                <option value="QoR">QoR</option>
                <option value="DRC">DRC</option>
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Status</label>
              <select
                id="status"
                value={selectedStatus || ''}
                onChange={(e) => setSelectedStatus(e.target.value || null)}
                className="w-full rounded-xl px-4 py-3 transition-all duration-300 focus:ring-2 focus:ring-primary focus:border-transparent"
                style={{
                  backgroundColor: 'var(--color-surface-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  border: '2px solid var(--color-border)'
                }}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div className="flex items-end">
              <motion.button 
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => {
                  setSelectedRunType(null);
                  setSelectedStatus(null);
                  setSearchTerm('');
                }}
                className="w-full px-6 py-3 rounded-xl font-semibold transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                  color: 'white',
                  border: 'none',
                  boxShadow: '0 4px 15px var(--color-primary-30)'
                }}
              >
                Clear Filters
              </motion.button>
            </div>
          </motion.div>
        </motion.div>

        {/* Enhanced Main Content Area */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="p-0 rounded-2xl shadow-card border overflow-hidden backdrop-blur-md" 
          style={{ 
            backgroundColor: 'var(--color-surface)', 
            borderColor: 'var(--color-border)',
            boxShadow: '0 25px 50px -12px var(--color-shadow)',
          }}
        >
          {viewMode === 'simple-flow' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-8 py-6">
                <div className="flex items-center justify-between">
                  <motion.h3 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-xl font-bold text-white flex items-center"
                  >
                    <ShareIcon className="h-6 w-6 mr-3" />
                    Simple Flow View
                  </motion.h3>
                  <div className="flex items-center space-x-4">
                    {isRunStatusConnected && runStatusDbStatus && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Auto-Connected to {runStatusDbStatus.connection.host}:{runStatusDbStatus.connection.port}/{runStatusDbStatus.connection.database}
                      </motion.div>
                    )}
                    {isRunStatusConnected && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRefreshRunStatusTables}
                        disabled={isRefreshingTables}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-all duration-300 font-medium disabled:opacity-50"
                      >
                        {isRefreshingTables ? 'Refreshing...' : 'Refresh Tables'}
                      </motion.button>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Manual: {dbConnection.host}:{dbConnection.port}/{dbConnection.database}
                      </motion.div>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDatabaseDisconnect}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-all duration-300 font-medium"
                      >
                        Disconnect
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {!isRunStatusConnected && !dbConnection ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ 
                        rotate: [0, 360],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                      }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-primary-10)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <CircleStackIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting to Run Status Database</h3>
                    <p className="mb-8 text-lg max-w-md" style={{ color: 'var(--color-text-muted)' }}>
                      {runStatusError ? (
                        <>
                          <span className="text-red-500">Connection failed: {runStatusError}</span>
                          <br />
                          <span className="text-sm">You can manually connect to a database as fallback.</span>
                        </>
                      ) : (
                        'Automatically connecting to the Run Status database to fetch tables and analyze data.'
                      )}
                    </p>
                    {runStatusError && (
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowDbModal(true)}
                        className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                          color: 'white',
                          boxShadow: '0 8px 25px var(--color-primary-30)'
                        }}
                      >
                        Manual Database Connection
                      </motion.button>
                    )}
                  </motion.div>
                </div>
              ) : (!isRunStatusConnected && !isConnected) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-warning-10)',
                        color: 'var(--color-warning)'
                      }}
                    >
                      <ArrowPathIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting...</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      Establishing connection to the database...
                    </p>
                  </motion.div>
                </div>
              ) : (isRunStatusConnected && runStatusTables.length === 0) || (!isRunStatusConnected && dbFiles.length === 0) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8" style={{
                      backgroundColor: 'var(--color-info-10)',
                      color: 'var(--color-info)'
                    }}>
                      <TableCellsIcon className="w-12 h-12" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>No Tables Found</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      No tables were found in the connected database.
                    </p>
                  </motion.div>
                </div>
              ) : !simpleFlowData ? (
                <div className="p-8">
                  <motion.h4 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-bold mb-6" 
                    style={{ color: 'var(--color-text)' }}
                  >
                    Select a table to analyze:
                  </motion.h4>
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-base mb-6" 
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {isRunStatusConnected 
                      ? 'Choose any table from the Run Status database. The system will analyze the data and create a simple flow visualization.'
                      : 'Choose any table from your database. The system will analyze the first row and create a simple flow visualization.'
                    }
                  </motion.p>
                  {(dbError || runStatusError) && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-6 p-4 rounded-xl" 
                      style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}
                    >
                      {runStatusError || dbError}
                    </motion.div>
                  )}
                  
                  {/* Show automated database tables first, then manual ones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Automated Run Status Database Tables */}
                    {isRunStatusConnected && runStatusTables.map((table, index) => (
                      <motion.div
                        key={`runstatus-${table.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300 relative"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-primary)',
                          borderWidth: '2px',
                          boxShadow: '0 4px 15px var(--color-primary-20)'
                        }}
                        onClick={() => handleRunStatusSimpleAnalyze(table)}
                      >
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 text-xs rounded-full" style={{
                            backgroundColor: 'var(--color-primary-10)',
                            color: 'var(--color-primary)'
                          }}>
                            Auto
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {table.table_name}
                          </h5>
                          <TableCellsIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {table.file_type}
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {table.schema_name || 'public'}</span>
                          <span>Rows: {table.row_count || 'Unknown'}</span>
                        </div>
                        {isSimpleAnalyzing && selectedRunStatusTable?.id === table.id && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
                            <div className="flex items-center text-white">
                              <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                              Analyzing...
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    
                    {/* Manual Database Tables */}
                    {!isRunStatusConnected && dbFiles.map((file, index) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          boxShadow: '0 4px 15px var(--color-shadow)'
                        }}
                        onClick={() => handleSimpleAnalyze(file)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {file.table_name}
                          </h5>
                          <TableCellsIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {file.file_type}
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {file.schema_name || 'public'}</span>
                          <span>Rows: {file.row_count || 'Unknown'}</span>
                        </div>
                        {isSimpleAnalyzing && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 flex items-center justify-center"
                          >
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <ArrowPathIcon className="w-5 h-5 mr-2" style={{ color: 'var(--color-primary)' }} />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>Analyzing...</span>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8">
                  <SimpleFlowVisualization 
                    flowData={simpleFlowData.flow_data}
                    onAnalyze={() => {
                      setSimpleFlowData(null);
                      setSelectedRunStatusTable(null);
                    }}
                    isLoading={isSimpleAnalyzing}
                  />
                </div>
              )}
            </>
          )}

          {/* Branch Flow View */}
          {viewMode === 'branch-flow' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-8 py-6">
                <div className="flex items-center justify-between">
                  <motion.h3 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-xl font-bold text-white flex items-center"
                  >
                    <CircleStackIcon className="h-6 w-6 mr-3" />
                    Branch Flow View
                  </motion.h3>
                  <div className="flex items-center space-x-4">
                    {isRunStatusConnected && runStatusDbStatus && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Auto-Connected to {runStatusDbStatus.connection.host}:{runStatusDbStatus.connection.port}/{runStatusDbStatus.connection.database}
                      </motion.div>
                    )}
                    {isRunStatusConnected && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRefreshRunStatusTables}
                        disabled={isRefreshingTables}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-all duration-300 font-medium disabled:opacity-50"
                      >
                        {isRefreshingTables ? 'Refreshing...' : 'Refresh Tables'}
                      </motion.button>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Manual: {dbConnection.host}:{dbConnection.port}/{dbConnection.database}
                      </motion.div>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDatabaseDisconnect}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-all duration-300 font-medium"
                      >
                        Disconnect
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {!isRunStatusConnected && !dbConnection ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ 
                        rotate: [0, 360],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                      }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-primary-10)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <CircleStackIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting to Run Status Database</h3>
                    <p className="mb-8 text-lg max-w-md" style={{ color: 'var(--color-text-muted)' }}>
                      {runStatusError ? (
                        <>
                          <span className="text-red-500">Connection failed: {runStatusError}</span>
                          <br />
                          <span className="text-sm">You can manually connect to a database as fallback.</span>
                        </>
                      ) : (
                        'Automatically connecting to the Run Status database to analyze branching patterns and generate intelligent flow visualizations.'
                      )}
                    </p>
                    {runStatusError && (
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowDbModal(true)}
                        className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                          color: 'white',
                          boxShadow: '0 8px 25px var(--color-primary-30)'
                        }}
                      >
                        Manual Database Connection
                      </motion.button>
                    )}
                  </motion.div>
                </div>
              ) : (!isRunStatusConnected && !isConnected) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-warning-10)',
                        color: 'var(--color-warning)'
                      }}
                    >
                      <ArrowPathIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting...</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      Establishing connection to the database...
                    </p>
                  </motion.div>
                </div>
              ) : (isRunStatusConnected && runStatusTables.length === 0) || (!isRunStatusConnected && dbFiles.length === 0) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8" style={{
                      backgroundColor: 'var(--color-info-10)',
                      color: 'var(--color-info)'
                    }}>
                      <TableCellsIcon className="w-12 h-12" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>No Tables Found</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      No tables were found in the connected database.
                    </p>
                  </motion.div>
                </div>
              ) : !branchFlowData ? (
                <div className="p-8">
                  <motion.h4 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-bold mb-6" 
                    style={{ color: 'var(--color-text)' }}
                  >
                    Select a table to analyze for branching patterns:
                  </motion.h4>
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-base mb-6" 
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {isRunStatusConnected 
                      ? 'Choose a table with run data from the Run Status database. The system will automatically detect when stages are copied from previous runs and create intelligent branching visualizations with curved connections.'
                      : 'Choose a table with run data. The system will automatically detect when stages are copied from previous runs and create intelligent branching visualizations with curved connections.'
                    }
                  </motion.p>
                  {(dbError || runStatusError) && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-6 p-4 rounded-xl" 
                      style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}
                    >
                      {runStatusError || dbError}
                    </motion.div>
                  )}
                  
                  {/* Show automated database tables first, then manual ones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Automated Run Status Database Tables */}
                    {isRunStatusConnected && runStatusTables.map((table, index) => (
                      <motion.div
                        key={`runstatus-branch-${table.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300 relative"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: '#FFD700',
                          borderWidth: '2px',
                          boxShadow: '0 4px 15px rgba(255, 215, 0, 0.2)'
                        }}
                        onClick={() => handleRunStatusBranchAnalyze(table)}
                      >
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 text-xs rounded-full" style={{
                            backgroundColor: 'rgba(255, 215, 0, 0.1)',
                            color: '#FFD700'
                          }}>
                            Auto
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {table.table_name}
                          </h5>
                          <CircleStackIcon className="w-6 h-6" style={{ color: '#FFD700' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {table.file_type} • Branch Analysis
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {table.schema_name || 'public'}</span>
                          <span>Rows: {table.row_count || 'Unknown'}</span>
                        </div>
                        {isBranchAnalyzing && selectedRunStatusTable?.id === table.id && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 flex items-center justify-center"
                          >
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <ArrowPathIcon className="w-5 h-5 mr-2" style={{ color: '#FFD700' }} />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: '#FFD700' }}>Analyzing branches...</span>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                    
                    {/* Manual Database Tables */}
                    {!isRunStatusConnected && dbFiles.map((file, index) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          boxShadow: '0 4px 15px var(--color-shadow)'
                        }}
                        onClick={() => handleBranchAnalyze(file)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {file.table_name}
                          </h5>
                          <CircleStackIcon className="w-6 h-6" style={{ color: '#FFD700' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {file.file_type} • Branch Analysis
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {file.schema_name || 'public'}</span>
                          <span>Rows: {file.row_count || 'Unknown'}</span>
                        </div>
                        {isBranchAnalyzing && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 flex items-center justify-center"
                          >
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <ArrowPathIcon className="w-5 h-5 mr-2" style={{ color: '#FFD700' }} />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: '#FFD700' }}>Analyzing branches...</span>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8">
                  <BranchFlowVisualization 
                    data={branchFlowData.branch_data}
                  />
                  <div className="mt-4 flex justify-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setBranchFlowData(null);
                        setSelectedFile(null);
                      }}
                      className="px-6 py-2 rounded-lg font-medium transition-all duration-300"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      Analyze Another Table
                    </motion.button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* RTL Flow View */}
          {viewMode === 'rtl-flow' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-8 py-6">
                <div className="flex items-center justify-between">
                  <motion.h3 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-xl font-bold text-white flex items-center"
                  >
                    <CpuChipIcon className="h-6 w-6 mr-3" />
                    RTL View
                  </motion.h3>
                  <div className="flex items-center space-x-4">
                    {isRunStatusConnected && runStatusDbStatus && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Auto-Connected to {runStatusDbStatus.connection.host}:{runStatusDbStatus.connection.port}/{runStatusDbStatus.connection.database}
                      </motion.div>
                    )}
                    {isRunStatusConnected && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRefreshRunStatusTables}
                        disabled={isRefreshingTables}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-all duration-300 font-medium disabled:opacity-50"
                      >
                        {isRefreshingTables ? 'Refreshing...' : 'Refresh Tables'}
                      </motion.button>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center text-white text-sm bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm"
                      >
                        <CircleStackIcon className="w-4 h-4 mr-2" />
                        Manual: {dbConnection.host}:{dbConnection.port}/{dbConnection.database}
                      </motion.div>
                    )}
                    {!isRunStatusConnected && dbConnection && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDatabaseDisconnect}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-all duration-300 font-medium"
                      >
                        Disconnect
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {!isRunStatusConnected && !dbConnection ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ 
                        rotate: [0, 360],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                      }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-primary-10)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <CpuChipIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting to Run Status Database</h3>
                    <p className="mb-8 text-lg max-w-md" style={{ color: 'var(--color-text-muted)' }}>
                      {runStatusError ? (
                        <>
                          <span className="text-red-500">Connection failed: {runStatusError}</span>
                          <br />
                          <span className="text-sm">You can manually connect to a database as fallback.</span>
                        </>
                      ) : (
                        'Automatically connecting to the Run Status database to analyze RTL version patterns and generate version-specific branching visualizations.'
                      )}
                    </p>
                    {runStatusError && (
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowDbModal(true)}
                        className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                          color: 'white',
                          boxShadow: '0 8px 25px var(--color-primary-30)'
                        }}
                      >
                        Manual Database Connection
                      </motion.button>
                    )}
                  </motion.div>
                </div>
              ) : (!isRunStatusConnected && !isConnected) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8" 
                      style={{
                        backgroundColor: 'var(--color-warning-10)',
                        color: 'var(--color-warning)'
                      }}
                    >
                      <ArrowPathIcon className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>Connecting...</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      Establishing connection to the database...
                    </p>
                  </motion.div>
                </div>
              ) : (isRunStatusConnected && getAvailableRtlTables().length === 0) || (!isRunStatusConnected && availableRtlFiles.length === 0) ? (
                <div className="text-center py-20">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8" style={{
                      backgroundColor: 'var(--color-info-10)',
                      color: 'var(--color-info)'
                    }}>
                      <TableCellsIcon className="w-12 h-12" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>No RTL Tables Found</h3>
                    <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                      No tables with an RTL_version column were found in the connected database.
                    </p>
                  </motion.div>
                </div>
              ) : !rtlFlowData ? (
                <div className="p-8">
                  <motion.h4 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-bold mb-6" 
                    style={{ color: 'var(--color-text)' }}
                  >
                    Select a table to analyze for RTL version patterns:
                  </motion.h4>
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-base mb-6" 
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {isRunStatusConnected 
                      ? 'Choose a table with RTL_version column from the Run Status database. The system will automatically detect RTL versions and create version-specific branching visualizations.'
                      : 'Choose a table with RTL_version column. The system will automatically detect RTL versions and create version-specific branching visualizations.'
                    }
                  </motion.p>
                  {(dbError || runStatusError) && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-6 p-4 rounded-xl" 
                      style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}
                    >
                      {runStatusError || dbError}
                    </motion.div>
                  )}
                  
                  {/* Show automated database tables first, then manual ones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Automated Run Status Database Tables with RTL_version */}
                    {isRunStatusConnected && getAvailableRtlTables().map((table, index) => (
                      <motion.div
                        key={`runstatus-rtl-${table.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300 relative"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-primary)',
                          borderWidth: '2px',
                          boxShadow: '0 4px 15px var(--color-primary-20)'
                        }}
                        onClick={() => handleRunStatusRtlAnalyze(table)}
                      >
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 text-xs rounded-full" style={{
                            backgroundColor: 'var(--color-primary-10)',
                            color: 'var(--color-primary)'
                          }}>
                            Auto
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {table.table_name}
                          </h5>
                          <CpuChipIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {table.file_type} • RTL Analysis
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {table.schema_name || 'public'}</span>
                          <span>Rows: {table.row_count || 'Unknown'}</span>
                        </div>
                        {isRtlAnalyzing && selectedRunStatusTable?.id === table.id && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 flex items-center justify-center"
                          >
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <ArrowPathIcon className="w-5 h-5 mr-2" style={{ color: 'var(--color-primary)' }} />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>Analyzing RTL versions...</span>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                    
                    {/* Manual Database Tables with RTL_version */}
                    {!isRunStatusConnected && availableRtlFiles.map((file, index) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-6 rounded-xl border cursor-pointer transition-all duration-300"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          boxShadow: '0 4px 15px var(--color-shadow)'
                        }}
                        onClick={() => handleRtlAnalyze(file)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-bold truncate text-lg" style={{ color: 'var(--color-text)' }}>
                            {file.table_name}
                          </h5>
                          <CpuChipIcon className="w-6 h-6" style={{ color: '#667eea' }} />
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {file.file_type} • RTL Analysis
                        </p>
                        <div className="flex justify-between items-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {file.schema_name || 'public'}</span>
                          <span>Rows: {file.row_count || 'Unknown'}</span>
                        </div>
                        {isRtlAnalyzing && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 flex items-center justify-center"
                          >
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <ArrowPathIcon className="w-5 h-5 mr-2" style={{ color: '#667eea' }} />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: '#667eea' }}>Analyzing RTL versions...</span>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8">
                  <RTLFlowVisualization 
                    data={rtlFlowData.rtl_data}
                  />
                  <div className="mt-4 flex justify-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setRtlFlowData(null);
                        setSelectedFile(null);
                      }}
                      className="px-6 py-2 rounded-lg font-medium transition-all duration-300"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      Analyze Another Table
                    </motion.button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Database Connection Modal */}
      <DatabaseConnectionModal
        isOpen={showDbModal}
        onClose={() => setShowDbModal(false)}
        onConnect={handleDatabaseConnect}
        isConnecting={isConnecting}
      />
    </div>
  );
}