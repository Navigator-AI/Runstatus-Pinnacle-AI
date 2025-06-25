import React, { useRef, useEffect, useState } from 'react';
import { BranchFlowData, BranchNode, BranchConnection } from '../services/flowtrackService';
import './BranchFlowVisualization.css';

interface BranchFlowVisualizationProps {
  data: BranchFlowData;
  className?: string;
}

const BranchFlowVisualization: React.FC<BranchFlowVisualizationProps> = ({ data, className = '' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<BranchNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data || !data.nodes || data.nodes.length === 0) {
      console.log('BranchFlowVisualization: No data or nodes to render', { data });
      return;
    }

    const svg = svgRef.current;
    console.log('BranchFlowVisualization: Rendering with data', { 
      nodes: data.nodes.length, 
      connections: data.connections.length,
      layout: data.layout 
    });
    
    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Create definitions for gradients and patterns
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Grid pattern
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'grid');
    pattern.setAttribute('width', data.layout.background.gridSize.toString());
    pattern.setAttribute('height', data.layout.background.gridSize.toString());
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${data.layout.background.gridSize} 0 L 0 0 0 ${data.layout.background.gridSize}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', data.layout.background.gridColor);
    path.setAttribute('stroke-width', '1');
    path.setAttribute('opacity', data.layout.background.gridOpacity.toString());
    
    pattern.appendChild(path);
    defs.appendChild(pattern);

    // Branch glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'branch-glow');
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');
    
    const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussianBlur.setAttribute('stdDeviation', '3');
    feGaussianBlur.setAttribute('result', 'coloredBlur');
    
    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'coloredBlur');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');
    
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    filter.appendChild(feGaussianBlur);
    filter.appendChild(feMerge);
    defs.appendChild(filter);

    svg.appendChild(defs);

    // Background
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', data.layout.width.toString());
    background.setAttribute('height', data.layout.height.toString());
    background.setAttribute('fill', data.layout.background.color);
    svg.appendChild(background);

    // Grid
    const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gridRect.setAttribute('width', data.layout.width.toString());
    gridRect.setAttribute('height', data.layout.height.toString());
    gridRect.setAttribute('fill', 'url(#grid)');
    svg.appendChild(gridRect);

    // Draw connections first (so they appear behind nodes)
    data.connections.forEach((connection: BranchConnection) => {
      const fromNode = data.nodes.find(n => n.id === connection.from);
      const toNode = data.nodes.find(n => n.id === connection.to);
      
      if (!fromNode || !toNode) return;

      const fromX = fromNode.x + fromNode.style.width / 2;
      const fromY = fromNode.y + fromNode.style.height / 2;
      const toX = toNode.x + toNode.style.width / 2;
      const toY = toNode.y + toNode.style.height / 2;

      if (connection.type === 'curved') {
        // Curved connection for branches
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (fromX + toX) / 2;
        const midY = fromY + (toY - fromY) * 0.3;
        
        const d = `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', connection.style.stroke);
        path.setAttribute('stroke-width', connection.style.strokeWidth.toString());
        if (connection.style.strokeDasharray) {
          path.setAttribute('stroke-dasharray', connection.style.strokeDasharray);
        }
        path.setAttribute('marker-end', 'url(#arrowhead)');
        
        if (connection.connection_category === 'branch') {
          path.setAttribute('filter', 'url(#branch-glow)');
        }
        
        svg.appendChild(path);
      } else {
        // Straight connection
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromX.toString());
        line.setAttribute('y1', fromY.toString());
        line.setAttribute('x2', toX.toString());
        line.setAttribute('y2', toY.toString());
        line.setAttribute('stroke', connection.style.stroke);
        line.setAttribute('stroke-width', connection.style.strokeWidth.toString());
        if (connection.style.strokeDasharray) {
          line.setAttribute('stroke-dasharray', connection.style.strokeDasharray);
        }
        line.setAttribute('marker-end', 'url(#arrowhead)');
        
        svg.appendChild(line);
      }
    });

    // Arrow marker
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', 'white');
    
    marker.appendChild(polygon);
    defs.appendChild(marker);

    // Draw nodes
    data.nodes.forEach((node: BranchNode) => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'branch-node');
      group.setAttribute('data-node-id', node.id);
      
      // Node rectangle
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', node.x.toString());
      rect.setAttribute('y', node.y.toString());
      rect.setAttribute('width', node.style.width.toString());
      rect.setAttribute('height', node.style.height.toString());
      rect.setAttribute('fill', node.style.fill);
      rect.setAttribute('stroke', node.style.stroke);
      rect.setAttribute('stroke-width', node.style.strokeWidth.toString());
      rect.setAttribute('rx', node.style.cornerRadius.toString());
      rect.setAttribute('ry', node.style.cornerRadius.toString());
      
      if (node.is_branch) {
        rect.setAttribute('filter', 'url(#branch-glow)');
      }
      
      group.appendChild(rect);
      
      // Node text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (node.x + node.style.width / 2).toString());
      text.setAttribute('y', (node.y + node.style.height / 2 + 5).toString());
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', node.style.textColor);
      text.setAttribute('font-size', node.style.fontSize.toString());
      text.setAttribute('font-weight', node.style.fontWeight);
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.textContent = node.label;
      
      group.appendChild(text);
      
      // Add event listeners
      group.addEventListener('mouseenter', () => setHoveredNode(node.id));
      group.addEventListener('mouseleave', () => setHoveredNode(null));
      group.addEventListener('click', () => setSelectedNode(node));
      
      svg.appendChild(group);
    });

  }, [data]);

  // No zoom controls - just scrollable as requested

  const handleNodeClick = (node: BranchNode) => {
    setSelectedNode(node);
  };

  const closeNodeDetails = () => {
    setSelectedNode(null);
  };

  // Handle case where data is not available
  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className={`branch-flow-container ${className}`}>
        <div className="branch-flow-header">
          <h3 className="text-lg font-semibold text-white mb-2">Branch Flow Visualization</h3>
        </div>
        <div className="branch-flow-content">
          <div className="text-center py-16">
            <div className="flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                backgroundColor: 'var(--color-warning-10)',
                color: 'var(--color-warning)'
              }}>
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>No Branch Data Available</h3>
              <p style={{ color: 'var(--color-text-muted)' }}>
                The analysis did not find any branching patterns in the selected data.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`branch-flow-container ${className}`}>
      <div className="branch-flow-header">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold text-white">Branch Flow Visualization</h3>
          {data.metadata?.username && (
            <div className="user-info">
              <span className="text-sm text-gray-300">User: </span>
              <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded">
                {data.metadata.username}
              </span>
            </div>
          )}
        </div>
        <div className="branch-flow-legend">
          <div className="legend-item">
            <div className="legend-color linear"></div>
            <span>Linear Flow</span>
          </div>
          <div className="legend-item">
            <div className="legend-color branch"></div>
            <span>Branch Flow</span>
          </div>
          <div className="legend-item">
            <div className="legend-line curved"></div>
            <span>Branch Connection</span>
          </div>
        </div>
      </div>
      
      <div className="branch-flow-content" ref={containerRef}>
        <svg
          ref={svgRef}
          width={data.layout?.width || 800}
          height={data.layout?.height || 600}
          className="branch-flow-svg"
          viewBox={`0 0 ${data.layout?.width || 800} ${data.layout?.height || 600}`}
        />
        
        {selectedNode && (
          <div className="node-details-panel">
            <div className="node-details-header">
              <h4>{selectedNode.label}</h4>
              <button onClick={closeNodeDetails} className="close-button">×</button>
            </div>
            <div className="node-details-content">
              <div className="detail-row">
                <span className="detail-label">Run:</span>
                <span className="detail-value">{selectedNode.run}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Stage:</span>
                <span className="detail-value">{selectedNode.stage}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Value:</span>
                <span className="detail-value">{selectedNode.value}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Type:</span>
                <span className={`detail-value ${selectedNode.is_branch ? 'branch' : 'linear'}`}>
                  {selectedNode.is_branch ? 'Branch Node' : 'Linear Node'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {data.debug_info && (
        <div className="branch-flow-debug">
          <h4>Analysis Summary</h4>
          <div className="debug-stats">
            <span>Runs: {data.debug_info.runs_processed}</span>
            <span>Branch Runs: {data.debug_info.branch_runs.length}</span>
            <span>Linear Runs: {data.debug_info.linear_runs.length}</span>
            <span>Total Stages: {data.debug_info.total_stages}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchFlowVisualization;