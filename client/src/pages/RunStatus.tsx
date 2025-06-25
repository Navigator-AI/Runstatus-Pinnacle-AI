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
  ChartPieIcon,
  DocumentTextIcon,
  UserIcon,
  CpuChipIcon,
  ShareIcon,
  CircleStackIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import runService from '../services/runService';
import userService from '../services/userService';
import flowtrackService, { DatabaseConnection, DatabaseFile, SimpleFlowAnalysisResult, BranchFlowAnalysisResult } from '../services/flowtrackService';
import DatabaseConnectionModal from '../components/DatabaseConnectionModal';
import SimpleFlowVisualization from '../components/SimpleFlowVisualization';
import BranchFlowVisualization from '../components/BranchFlowVisualization';

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
  const [viewMode, setViewMode] = useState<'list' | 'flow' | 'waffle' | 'simple-flow' | 'branch-flow'>('list');
  
  // Simple Flow related state
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbConnection, setDbConnection] = useState<DatabaseConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dbFiles, setDbFiles] = useState<DatabaseFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DatabaseFile | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [simpleFlowData, setSimpleFlowData] = useState<SimpleFlowAnalysisResult | null>(null);
  const [isSimpleAnalyzing, setIsSimpleAnalyzing] = useState(false);
  
  // Branch Flow related state
  const [branchFlowData, setBranchFlowData] = useState<BranchFlowAnalysisResult | null>(null);
  const [isBranchAnalyzing, setIsBranchAnalyzing] = useState(false);

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
    setDbError(null);
    setIsSimpleAnalyzing(false);
    setIsBranchAnalyzing(false);
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

  const handleViewModeChange = (mode: 'list' | 'flow' | 'waffle' | 'simple-flow' | 'branch-flow') => {
    setViewMode(mode);
    
    // If switching to flow modes and no connection exists, show modal
    if ((mode === 'simple-flow' || mode === 'branch-flow') && !dbConnection) {
      setShowDbModal(true);
    }
  };

  return (
    <div
      className="min-h-screen p-4 md:p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(to-b, var(--color-bg), var(--color-bg-dark))',
      }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle at 2px 2px, var(--color-primary) 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 rounded-xl backdrop-blur-sm"
          style={{
            background: 'linear-gradient(to-r, var(--color-surface), var(--color-surface-dark))',
            border: '1px solid var(--color-border)',
            boxShadow: '0 10px 25px -5px var(--color-shadow), 0 8px 10px -6px var(--color-shadow-light)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        >
          <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {selectedUser ? `${selectedUser.name}'s Run Status` : 'Physical Design Run Status'}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {isAdmin() 
              ? selectedUser 
                ? `Viewing run status for ${selectedUser.name}`
                : 'Monitor and manage IC design runs across the platform' 
              : 'Track the status of your IC design runs'}
          </p>
        </motion.div>

      {/* User selection for admins */}
      {isAdmin() && users.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="p-4 rounded-xl shadow-card border" 
          style={{ 
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 20px 25px -5px var(--color-shadow), 0 10px 10px -5px var(--color-shadow-light)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Select User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <motion.div 
              whileHover={{ y: -5, boxShadow: '0 10px 15px -3px var(--color-shadow), 0 4px 6px -2px var(--color-shadow-light)' }}
              onClick={() => setSelectedUserId(null)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedUserId === null 
                  ? 'border-primary bg-primary-light' 
                  : 'hover:bg-surface-light'
              }`}
              style={{ 
                borderColor: selectedUserId === null ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: selectedUserId === null ? 'var(--color-primary-10)' : 'var(--color-surface)',
                transition: 'all 0.3s ease',
              }}
            >
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
                  backgroundColor: 'var(--color-primary-20)',
                  color: 'var(--color-primary)'
                }}>
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="ml-3">
                  <div className="font-medium" style={{ color: 'var(--color-text)' }}>All Users</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>View runs from all users</div>
                </div>
              </div>
            </motion.div>
            
            {users.map(u => (
              <motion.div 
                key={u.id}
                whileHover={{ y: -5, boxShadow: '0 10px 15px -3px var(--color-shadow), 0 4px 6px -2px var(--color-shadow-light)' }}
                onClick={() => setSelectedUserId(u.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedUserId === u.id 
                    ? 'border-primary bg-primary-light' 
                    : 'hover:bg-surface-light'
                }`}
                style={{ 
                  borderColor: selectedUserId === u.id ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: selectedUserId === u.id ? 'var(--color-primary-10)' : 'var(--color-surface)',
                  transition: 'all 0.3s ease',
                }}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold" style={{
                    backgroundColor: 'var(--color-primary-20)',
                    color: 'var(--color-primary)'
                  }}>
                    {u.name ? u.name.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="ml-3">
                    <div className="font-medium" style={{ color: 'var(--color-text)' }}>{u.name || u.username}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{u.username}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters and view toggle */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="p-0 rounded-xl shadow-card border overflow-hidden" 
        style={{ 
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          boxShadow: '0 20px 25px -5px var(--color-shadow), 0 10px 10px -5px var(--color-shadow-light)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {selectedUser ? `Runs for ${selectedUser.name}` : 'All Runs'}
            </h3>
          
            <div className="flex space-x-2 mt-2 md:mt-0">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleViewModeChange('list')}
                className="flex items-center px-3 py-1.5 rounded-lg transition-all"
                style={{ 
                  backgroundColor: viewMode === 'list' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: viewMode === 'list' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <TableCellsIcon className="w-4 h-4 mr-2" />
                List View
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleViewModeChange('flow')}
                className="flex items-center px-3 py-1.5 rounded-lg transition-all"
                style={{ 
                  backgroundColor: viewMode === 'flow' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: viewMode === 'flow' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <ChartPieIcon className="w-4 h-4 mr-2" />
                Flow View
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleViewModeChange('waffle')}
                className="flex items-center px-3 py-1.5 rounded-lg transition-all"
                style={{ 
                  backgroundColor: viewMode === 'waffle' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: viewMode === 'waffle' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <DocumentTextIcon className="w-4 h-4 mr-2" />
                Waffle View
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleViewModeChange('simple-flow')}
                className="flex items-center px-3 py-1.5 rounded-lg transition-all"
                style={{ 
                  backgroundColor: viewMode === 'simple-flow' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: viewMode === 'simple-flow' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <ShareIcon className="w-4 h-4 mr-2" />
                Simple Flow
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleViewModeChange('branch-flow')}
                className="flex items-center px-3 py-1.5 rounded-lg transition-all"
                style={{ 
                  backgroundColor: viewMode === 'branch-flow' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: viewMode === 'branch-flow' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <CircleStackIcon className="w-4 h-4 mr-2" />
                Branch Flow
              </motion.button>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
          <div>
            <label htmlFor="search" className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Search</label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search runs..."
              className="w-full rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)'
              }}
            />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Run Type</label>
            <select
              id="type"
              value={selectedRunType || ''}
              onChange={(e) => setSelectedRunType(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)'
              }}
            >
              <option value="">All Types</option>
              <option value="Timing">Timing</option>
              <option value="QoR">QoR</option>
              <option value="DRC">DRC</option>
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
            <select
              id="status"
              value={selectedStatus || ''}
              onChange={(e) => setSelectedStatus(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)'
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
              whileHover={{ scale: 1.05, boxShadow: '0 4px 6px -1px var(--color-shadow), 0 2px 4px -1px var(--color-shadow-light)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedRunType(null);
                setSelectedStatus(null);
                setSearchTerm('');
              }}
              className="px-4 py-2 rounded-lg transition-all"
              style={{
                background: 'linear-gradient(to-r, var(--color-primary), var(--color-primary-dark))',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 2px 4px var(--color-shadow)'
              }}
            >
              Clear Filters
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Run list */}
      {loading ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="p-8 rounded-xl shadow-card border flex items-center justify-center" 
          style={{ 
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 20px 25px -5px var(--color-shadow), 0 10px 10px -5px var(--color-shadow-light)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <div className="flex flex-col items-center py-12">
            <div className="relative">
              <div className="w-16 h-16 rounded-full animate-spin" style={{
                borderWidth: '4px',
                borderStyle: 'solid',
                borderColor: 'var(--color-primary-30)',
                borderTopColor: 'var(--color-primary)',
                boxShadow: '0 0 15px var(--color-primary-40)'
              }}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <CpuChipIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
              </div>
            </div>
            <h3 className="mt-6 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>Loading Runs</h3>
            <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>Please wait while we fetch your run data...</p>
          </div>
        </motion.div>
      ) : filteredRuns.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="p-8 rounded-xl shadow-card border text-center" 
          style={{ 
            backgroundColor: 'var(--color-surface)', 
            borderColor: 'var(--color-border)',
            boxShadow: '0 20px 25px -5px var(--color-shadow), 0 10px 10px -5px var(--color-shadow-light)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{
              backgroundColor: 'var(--color-primary-10)',
              color: 'var(--color-primary)'
            }}>
              <CpuChipIcon className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>No Runs Found</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>No runs match your current filters or no runs have been created yet.</p>
            <motion.button 
              whileHover={{ scale: 1.05, boxShadow: '0 4px 6px -1px var(--color-shadow), 0 2px 4px -1px var(--color-shadow-light)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedRunType(null);
                setSelectedStatus(null);
                setSearchTerm('');
              }}
              className="mt-6 px-6 py-3 rounded-lg transition-all"
              style={{
                background: 'linear-gradient(to-r, var(--color-primary), var(--color-primary-dark))',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 2px 4px var(--color-shadow)'
              }}
            >
              Clear Filters
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="p-0 rounded-xl shadow-card border overflow-hidden" 
          style={{ 
            backgroundColor: 'var(--color-surface)', 
            borderColor: 'var(--color-border)',
            boxShadow: '0 20px 25px -5px var(--color-shadow), 0 10px 10px -5px var(--color-shadow-light)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            position: 'relative',
            zIndex: 10,
          }}
        >
          {viewMode === 'list' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <TableCellsIcon className="h-5 w-5 mr-2" />
                  List View
                </h3>
              </div>
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{
                    backgroundColor: 'var(--color-primary-10)',
                    color: 'var(--color-primary)'
                  }}>
                    <TableCellsIcon className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>List View Coming Soon</h3>
                  <p style={{ color: 'var(--color-text-muted)' }}>The run status list view is under development and will be available soon.</p>
                </div>
              </div>
            </>
          )}
          
          {viewMode === 'flow' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <ChartPieIcon className="h-5 w-5 mr-2" />
                  Flow View
                </h3>
              </div>
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{
                    backgroundColor: 'var(--color-primary-10)',
                    color: 'var(--color-primary)'
                  }}>
                    <ChartPieIcon className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Flow View Coming Soon</h3>
                  <p style={{ color: 'var(--color-text-muted)' }}>The run status flow view is under development and will be available soon.</p>
                </div>
              </div>
            </>
          )}
          
          {viewMode === 'waffle' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Waffle View
                </h3>
              </div>
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{
                    backgroundColor: 'var(--color-primary-10)',
                    color: 'var(--color-primary)'
                  }}>
                    <DocumentTextIcon className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Waffle View Coming Soon</h3>
                  <p style={{ color: 'var(--color-text-muted)' }}>The run status waffle view is under development and will be available soon.</p>
                </div>
              </div>
            </>
          )}

          {viewMode === 'simple-flow' && (
            <>
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <ShareIcon className="h-5 w-5 mr-2" />
                    Simple Flow View
                  </h3>
                  <div className="flex items-center space-x-3">
                    {dbConnection && (
                      <div className="flex items-center text-white text-sm">
                        <CircleStackIcon className="w-4 h-4 mr-1" />
                        Connected to {dbConnection.host}:{dbConnection.port}/{dbConnection.database}
                      </div>
                    )}
                    {dbConnection && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDatabaseDisconnect}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors"
                      >
                        Disconnect
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {!dbConnection ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-primary-10)',
                      color: 'var(--color-primary)'
                    }}>
                      <CircleStackIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Connect to Database</h3>
                    <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
                      Connect to your PostgreSQL database to analyze data and generate simple flow visualizations.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowDbModal(true)}
                      className="px-6 py-3 rounded-lg font-medium transition-all"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'white'
                      }}
                    >
                      Connect Database
                    </motion.button>
                  </div>
                </div>
              ) : !isConnected ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-warning-10)',
                      color: 'var(--color-warning)'
                    }}>
                      <ArrowPathIcon className="w-10 h-10 animate-spin" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Connecting...</h3>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      Establishing connection to the database...
                    </p>
                  </div>
                </div>
              ) : dbFiles.length === 0 ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-info-10)',
                      color: 'var(--color-info)'
                    }}>
                      <TableCellsIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>No Tables Found</h3>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      No tables were found in the connected database.
                    </p>
                  </div>
                </div>
              ) : !simpleFlowData ? (
                <div className="p-6">
                  <h4 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
                    Select a table to analyze:
                  </h4>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Choose any table from your database. The system will analyze the first row and create a simple flow visualization.
                  </p>
                  {dbError && (
                    <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}>
                      {dbError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dbFiles.map((file) => (
                      <motion.div
                        key={file.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-4 rounded-lg border cursor-pointer transition-all"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          boxShadow: '0 2px 4px var(--color-shadow)'
                        }}
                        onClick={() => handleSimpleAnalyze(file)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                            {file.table_name}
                          </h5>
                          <TableCellsIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          {file.file_type}
                        </p>
                        <div className="flex justify-between items-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {file.schema_name || 'public'}</span>
                          <span>Rows: {file.row_count || 'Unknown'}</span>
                        </div>
                        {isSimpleAnalyzing && (
                          <div className="mt-2 flex items-center justify-center">
                            <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" style={{ color: 'var(--color-primary)' }} />
                            <span className="text-sm" style={{ color: 'var(--color-primary)' }}>Analyzing...</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <SimpleFlowVisualization 
                    flowData={simpleFlowData.flow_data}
                    onAnalyze={() => {
                      // Reset and show table selection again
                      setSimpleFlowData(null);
                      setSelectedFile(null);
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
              <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <CircleStackIcon className="h-5 w-5 mr-2" />
                    Branch Flow View
                  </h3>
                  <div className="flex items-center space-x-3">
                    {dbConnection && (
                      <div className="flex items-center text-white text-sm">
                        <CircleStackIcon className="w-4 h-4 mr-1" />
                        Connected to {dbConnection.host}:{dbConnection.port}/{dbConnection.database}
                      </div>
                    )}
                    {dbConnection && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDatabaseDisconnect}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors"
                      >
                        Disconnect
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {!dbConnection ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-primary-10)',
                      color: 'var(--color-primary)'
                    }}>
                      <CircleStackIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Connect to Database</h3>
                    <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
                      Connect to your PostgreSQL database to analyze branching patterns and generate intelligent flow visualizations.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowDbModal(true)}
                      className="px-6 py-3 rounded-lg font-medium transition-all"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'white'
                      }}
                    >
                      Connect Database
                    </motion.button>
                  </div>
                </div>
              ) : !isConnected ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-warning-10)',
                      color: 'var(--color-warning)'
                    }}>
                      <ArrowPathIcon className="w-10 h-10 animate-spin" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Connecting...</h3>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      Establishing connection to the database...
                    </p>
                  </div>
                </div>
              ) : dbFiles.length === 0 ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                      backgroundColor: 'var(--color-info-10)',
                      color: 'var(--color-info)'
                    }}>
                      <TableCellsIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>No Tables Found</h3>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      No tables were found in the connected database.
                    </p>
                  </div>
                </div>
              ) : !branchFlowData ? (
                <div className="p-6">
                  <h4 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
                    Select a table to analyze for branching patterns:
                  </h4>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Choose a table with run data. The system will automatically detect when stages are copied from previous runs and create intelligent branching visualizations with curved connections.
                  </p>
                  {dbError && (
                    <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}>
                      {dbError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dbFiles.map((file) => (
                      <motion.div
                        key={file.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="p-4 rounded-lg border cursor-pointer transition-all"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          boxShadow: '0 2px 4px var(--color-shadow)'
                        }}
                        onClick={() => handleBranchAnalyze(file)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                            {file.table_name}
                          </h5>
                          <CircleStackIcon className="w-5 h-5" style={{ color: '#FFD700' }} />
                        </div>
                        <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          {file.file_type} • Branch Analysis
                        </p>
                        <div className="flex justify-between items-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          <span>Schema: {file.schema_name || 'public'}</span>
                          <span>Rows: {file.row_count || 'Unknown'}</span>
                        </div>
                        {isBranchAnalyzing && (
                          <div className="mt-2 flex items-center justify-center">
                            <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" style={{ color: '#FFD700' }} />
                            <span className="text-sm" style={{ color: '#FFD700' }}>Analyzing branches...</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6">
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
                      className="px-6 py-2 rounded-lg font-medium transition-all"
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
      )}
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