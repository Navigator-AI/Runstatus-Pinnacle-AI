import React, { useState, useEffect } from 'react';
import { TableCellsIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface DatabaseTableViewerProps {
  tableName: string;
  data: any[];
  columns: string[];
  maxHeight?: number;
  isDarkTheme?: boolean;
}

const DatabaseTableViewer: React.FC<DatabaseTableViewerProps> = ({
  tableName,
  data,
  columns,
  maxHeight = 400,
  isDarkTheme = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>(data);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredData(data);
    } else {
      const lowercasedTerm = searchTerm.toLowerCase();
      const filtered = data.filter(item => {
        return Object.values(item).some(value => 
          value !== null && 
          value !== undefined && 
          value.toString().toLowerCase().includes(lowercasedTerm)
        );
      });
      setFilteredData(filtered);
    }
  }, [searchTerm, data]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="database-table-viewer" style={{
      marginBottom: '1rem',
      border: isDarkTheme ? '1px solid #2f374f' : '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      overflow: 'hidden',
      backgroundColor: isDarkTheme ? '#1e2333' : '#ffffff',
    }}>
      {/* Table Header */}
      <div className="table-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        backgroundColor: isDarkTheme ? '#252a3d' : '#f9fafb',
        borderBottom: isDarkTheme ? '1px solid #2f374f' : '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TableCellsIcon className="w-5 h-5" style={{ color: isDarkTheme ? '#9ca3af' : '#4b5563' }} />
          <h3 style={{ 
            margin: 0, 
            fontSize: '1rem', 
            fontWeight: 600,
            color: isDarkTheme ? '#e5e7eb' : '#111827'
          }}>
            {tableName} ({filteredData.length} rows)
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search table..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              border: isDarkTheme ? '1px solid #4b5563' : '1px solid #d1d5db',
              backgroundColor: isDarkTheme ? '#111827' : '#ffffff',
              color: isDarkTheme ? '#e5e7eb' : '#111827',
              fontSize: '0.875rem',
            }}
          />
          <button
            onClick={toggleExpand}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2rem',
              height: '2rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: isDarkTheme ? '#374151' : '#f3f4f6',
              color: isDarkTheme ? '#e5e7eb' : '#4b5563',
              cursor: 'pointer',
            }}
          >
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div style={{
        maxHeight: isExpanded ? 'none' : `${maxHeight}px`,
        overflowY: 'auto',
        overflowX: 'auto',
        transition: 'max-height 0.3s ease-in-out',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
        }}>
          <thead>
            <tr style={{
              backgroundColor: isDarkTheme ? '#1f2937' : '#f3f4f6',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              {columns.map((column, index) => (
                <th key={index} style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: isDarkTheme ? '#e5e7eb' : '#111827',
                  borderBottom: isDarkTheme ? '1px solid #374151' : '1px solid #e5e7eb',
                  whiteSpace: 'nowrap',
                }}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} style={{
                  backgroundColor: rowIndex % 2 === 0 
                    ? (isDarkTheme ? '#111827' : '#ffffff') 
                    : (isDarkTheme ? '#1a202c' : '#f9fafb'),
                }}>
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} style={{
                      padding: '0.75rem 1rem',
                      borderBottom: isDarkTheme ? '1px solid #2d3748' : '1px solid #e5e7eb',
                      color: isDarkTheme ? '#d1d5db' : '#374151',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {row[column] !== null && row[column] !== undefined ? String(row[column]) : 'NULL'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={columns.length} 
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: isDarkTheme ? '#9ca3af' : '#6b7280',
                    fontStyle: 'italic',
                  }}
                >
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DatabaseTableViewer;