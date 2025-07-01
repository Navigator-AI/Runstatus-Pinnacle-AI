import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserIcon, 
  CpuChipIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { RTLFlowData, RTLVersionAnalysis } from '../services/flowtrackService';
import BranchFlowVisualization from './BranchFlowVisualization';
import './RTLFlowVisualization.css';

interface RTLFlowVisualizationProps {
  data: RTLFlowData;
}

export default function RTLFlowVisualization({ data }: RTLFlowVisualizationProps) {
  const [analysisStatus, setAnalysisStatus] = useState<'initiating' | 'initiated'>('initiating');
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [selectedVersionData, setSelectedVersionData] = useState<RTLVersionAnalysis | null>(null);

  // Simulate analysis initiation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnalysisStatus('initiated');
    }, 2000); // Show "initiating analysis" for 2 seconds

    return () => clearTimeout(timer);
  }, []);

  const handleVersionClick = (version: string) => {
    setSelectedVersion(version);
    setSelectedVersionData(data.version_analyses[version] || null);
  };

  const handleBackToVersions = () => {
    setSelectedVersion(null);
    setSelectedVersionData(null);
  };

  if (analysisStatus === 'initiating') {
    return (
      <div className="rtl-flow-container">
        <div className="rtl-analysis-status">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="status-card initiating"
          >
            <ArrowPathIcon className="status-icon animate-spin" />
            <h3>Initiating Analysis</h3>
            <p>Analyzing RTL version data and detecting branching patterns...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (selectedVersion && selectedVersionData) {
    return (
      <div className="rtl-flow-container">
        <div className="rtl-header">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleBackToVersions}
            className="back-button"
          >
            ← Back to Versions
          </motion.button>
          <div className="version-title">
            <CpuChipIcon className="version-icon" />
            <h2>{selectedVersion} Branching Analysis</h2>
          </div>
        </div>
        
        <div className="version-visualization">
          <BranchFlowVisualization data={selectedVersionData.branch_layout} />
        </div>
      </div>
    );
  }

  return (
    <div className="rtl-flow-container">
      {/* Analysis Status */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rtl-analysis-status"
      >
        <div className="status-card initiated">
          <CheckCircleIcon className="status-icon" />
          <h3>Initiated</h3>
          <p>RTL analysis completed successfully</p>
        </div>
      </motion.div>

      {/* User and Versions Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rtl-header"
      >
        <div className="user-info">
          <UserIcon className="user-icon" />
          <span className="username">{data.username}</span>
        </div>
        
        <div className="rtl-versions">
          <span className="versions-label">RTL Versions:</span>
          <div className="version-links">
            {data.rtl_versions.map((version, index) => (
              <motion.button
                key={version}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + (index * 0.1) }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleVersionClick(version)}
                className="version-link"
              >
                <CpuChipIcon className="version-link-icon" />
                {version}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Version Selection Prompt */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="version-selection-prompt"
      >
        <div className="prompt-card">
          <CpuChipIcon className="prompt-icon" />
          <h3>Select RTL Version</h3>
          <p>
            Click on any RTL version above to view its specific branching analysis. 
            Each version shows how runs branch from previous stages within that RTL version.
          </p>
          <div className="version-stats">
            <div className="stat">
              <span className="stat-value">{data.total_versions}</span>
              <span className="stat-label">Total Versions</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {Object.values(data.version_analyses).reduce((total, analysis) => 
                  total + analysis.data.length, 0
                )}
              </span>
              <span className="stat-label">Total Runs</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Version Preview Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="version-preview-grid"
      >
        {data.rtl_versions.map((version, index) => {
          const versionAnalysis = data.version_analyses[version];
          const runCount = versionAnalysis?.data.length || 0;
          const branchCount = Object.keys(versionAnalysis?.copy_patterns || {}).length;
          
          return (
            <motion.div
              key={version}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 + (index * 0.1) }}
              whileHover={{ scale: 1.02, y: -5 }}
              onClick={() => handleVersionClick(version)}
              className="version-preview-card"
            >
              <div className="version-preview-header">
                <CpuChipIcon className="version-preview-icon" />
                <h4>{version}</h4>
              </div>
              <div className="version-preview-stats">
                <div className="preview-stat">
                  <span className="preview-stat-value">{runCount}</span>
                  <span className="preview-stat-label">Runs</span>
                </div>
                <div className="preview-stat">
                  <span className="preview-stat-value">{branchCount}</span>
                  <span className="preview-stat-label">Branches</span>
                </div>
              </div>
              <div className="version-preview-action">
                <span>Click to analyze →</span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}