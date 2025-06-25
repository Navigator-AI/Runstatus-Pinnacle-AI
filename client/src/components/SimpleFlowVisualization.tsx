import React, { useState } from 'react';
import './SimpleFlowVisualization.css';

interface FlowStep {
  id: string;
  position: number;
  column_name: string;
  value: string;
  display_value: string;
  is_first: boolean;
  is_last: boolean;
}

interface HeaderFlow {
  id: string;
  type: 'header';
  initial_value: string;
  initial_display: string;
  complete_flow: FlowStep[];
}

interface DataRow {
  id: string;
  row_number: number;
  type: 'data';
  initial_value: string;
  initial_display: string;
  complete_flow: FlowStep[];
}

interface FlowData {
  table_name: string;
  total_columns: number;
  total_rows: number;
  header_flow: HeaderFlow;
  data_rows: DataRow[];
  metadata: {
    analyzed_at: string;
    total_rows_analyzed: number;
    analysis_type: string;
    description: string;
  };
}

interface SimpleFlowVisualizationProps {
  flowData: FlowData;
  onAnalyze?: () => void;
  isLoading?: boolean;
}

const SimpleFlowVisualization: React.FC<SimpleFlowVisualizationProps> = ({
  flowData,
  onAnalyze,
  isLoading = false
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [animatingSteps, setAnimatingSteps] = useState<Set<string>>(new Set());

  const handleItemClick = (itemId: string, itemType: 'header' | 'data') => {
    const newExpandedItems = new Set(expandedItems);
    
    if (expandedItems.has(itemId)) {
      // Collapse
      newExpandedItems.delete(itemId);
      setExpandedItems(newExpandedItems);
      setAnimatingSteps(new Set()); // Clear animations
    } else {
      // Expand
      newExpandedItems.add(itemId);
      setExpandedItems(newExpandedItems);
      
      // Animate steps one by one
      let flowToAnimate;
      if (itemType === 'header') {
        flowToAnimate = flowData.header_flow;
      } else {
        flowToAnimate = flowData.data_rows.find(r => r.id === itemId);
      }
      
      if (flowToAnimate) {
        flowToAnimate.complete_flow.forEach((step, index) => {
          setTimeout(() => {
            setAnimatingSteps(prev => {
              const newSet = new Set(prev);
              newSet.add(step.id);
              return newSet;
            });
          }, index * 150); // 150ms delay between each step
        });
      }
    }
  };

  if (!flowData) {
    return (
      <div className="simple-flow-container">
        <div className="flow-header">
          <h3>Data Flow Analysis</h3>
          <button 
            onClick={onAnalyze}
            disabled={isLoading}
            className="analyze-button"
          >
            {isLoading ? 'Analyzing...' : 'Analyze Data'}
          </button>
        </div>
        <div className="no-data-message">
          <p>No data analyzed yet. Click "Analyze Data" to generate flow visualization.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="simple-flow-container">
      <div className="flow-header">
        <h3>Vertical Header + Data Flow Analysis</h3>
        <div className="flow-info">
          <span className="table-name">Table: <strong>{flowData.table_name}</strong></span>
          <span className="column-count">Columns: <strong>{flowData.total_columns}</strong></span>
          <span className="row-count">Rows: <strong>{flowData.total_rows}</strong></span>
        </div>
      </div>

      <div className="flow-content">
        <div className="vertical-flow-layout">
          {/* Left side - Vertical list of header + data rows */}
          <div className="vertical-items-list">
            {/* Header Row */}
            <div className="flow-item-container">
              <div 
                className={`flow-item header-item ${expandedItems.has(flowData.header_flow.id) ? 'expanded' : ''}`}
                onClick={() => handleItemClick(flowData.header_flow.id, 'header')}
              >
                <div className="item-content">
                  <span className="item-value" title={flowData.header_flow.initial_value}>
                    {flowData.header_flow.initial_display}
                  </span>
                </div>
                <div className="expand-indicator">
                  {expandedItems.has(flowData.header_flow.id) ? '▼' : '▶'}
                </div>
              </div>
              
              {/* Header horizontal expansion */}
              {expandedItems.has(flowData.header_flow.id) && (
                <div className="horizontal-expansion">
                  <div className="flow-steps-container">
                    {flowData.header_flow.complete_flow.map((step, stepIndex) => (
                      <React.Fragment key={step.id}>
                        <div 
                          className={`flow-step-box small ${animatingSteps.has(step.id) ? 'animate-in' : ''}`}
                          style={{
                            animationDelay: `${stepIndex * 150}ms`
                          }}
                        >
                          <div className="step-content">
                            <span className="step-value" title={step.value}>
                              {step.display_value}
                            </span>
                          </div>
                        </div>
                        
                        {/* Arrow between steps */}
                        {!step.is_last && (
                          <div 
                            className={`flow-arrow ${animatingSteps.has(step.id) ? 'animate-arrow' : ''}`}
                            style={{
                              animationDelay: `${stepIndex * 150 + 75}ms`
                            }}
                          >
                            <span className="arrow-symbol">→</span>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Data Rows */}
            {flowData.data_rows.map((row, rowIndex) => (
              <div key={row.id} className="flow-item-container">
                <div 
                  className={`flow-item data-item ${expandedItems.has(row.id) ? 'expanded' : ''}`}
                  onClick={() => handleItemClick(row.id, 'data')}
                >
                  <div className="item-content">
                    <span className="item-value" title={row.initial_value}>
                      {row.initial_display}
                    </span>
                  </div>
                  <div className="expand-indicator">
                    {expandedItems.has(row.id) ? '▼' : '▶'}
                  </div>
                </div>
                
                {/* Data row horizontal expansion */}
                {expandedItems.has(row.id) && (
                  <div className="horizontal-expansion">
                    <div className="flow-steps-container">
                      {row.complete_flow.map((step, stepIndex) => (
                        <React.Fragment key={step.id}>
                          <div 
                            className={`flow-step-box small ${animatingSteps.has(step.id) ? 'animate-in' : ''}`}
                            style={{
                              animationDelay: `${stepIndex * 150}ms`
                            }}
                          >
                            <div className="step-content">
                              <span className="step-value" title={step.value}>
                                {step.display_value}
                              </span>
                            </div>
                          </div>
                          
                          {/* Arrow between steps */}
                          {!step.is_last && (
                            <div 
                              className={`flow-arrow ${animatingSteps.has(step.id) ? 'animate-arrow' : ''}`}
                              style={{
                                animationDelay: `${stepIndex * 150 + 75}ms`
                              }}
                            >
                              <span className="arrow-symbol">→</span>
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flow-metadata">
        <div className="metadata-item">
          <span className="metadata-label">Analyzed:</span>
          <span className="metadata-value">
            {new Date(flowData.metadata.analyzed_at).toLocaleString()}
          </span>
        </div>
        <div className="metadata-item">
          <span className="metadata-label">Rows Analyzed:</span>
          <span className="metadata-value">{flowData.metadata.total_rows_analyzed}</span>
        </div>
        <div className="metadata-item">
          <span className="metadata-label">Description:</span>
          <span className="metadata-value">{flowData.metadata.description}</span>
        </div>
      </div>
    </div>
  );
};

export default SimpleFlowVisualization;