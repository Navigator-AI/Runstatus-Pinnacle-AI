import React, { useState } from 'react';
import { TableCellsIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface DatabaseTableListProps {
  tables: string[];
  onSelectTable: (tableName: string) => void;
  isDarkTheme?: boolean;
}

const DatabaseTableList: React.FC<DatabaseTableListProps> = ({
  tables,
  onSelectTable,
  isDarkTheme = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTables = tables.filter(table => 
    table.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="database-table-list" style={{
      border: isDarkTheme ? '1px solid #2f374f' : '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      overflow: 'hidden',
      backgroundColor: isDarkTheme ? '#1e2333' : '#ffffff',
      marginBottom: '1rem',
    }}>
      <div className="table-list-header" style={{
        padding: '0.75rem 1rem',
        backgroundColor: isDarkTheme ? '#252a3d' : '#f9fafb',
        borderBottom: isDarkTheme ? '1px solid #2f374f' : '1px solid #e5e7eb',
      }}>
        <h3 style={{ 
          margin: '0 0 0.5rem 0', 
          fontSize: '1rem', 
          fontWeight: 600,
          color: isDarkTheme ? '#e5e7eb' : '#111827',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <TableCellsIcon className="w-5 h-5" style={{ color: isDarkTheme ? '#9ca3af' : '#4b5563' }} />
          Database Tables ({tables.length})
        </h3>
        <input
          type="text"
          placeholder="Search tables..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: isDarkTheme ? '1px solid #4b5563' : '1px solid #d1d5db',
            backgroundColor: isDarkTheme ? '#111827' : '#ffffff',
            color: isDarkTheme ? '#e5e7eb' : '#111827',
            fontSize: '0.875rem',
          }}
        />
      </div>
      
      <div style={{
        maxHeight: '300px',
        overflowY: 'auto',
      }}>
        {filteredTables.length > 0 ? (
          <ul style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}>
            {filteredTables.map((table, index) => (
              <li key={index}>
                <button
                  onClick={() => onSelectTable(table)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    textAlign: 'left',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: index < filteredTables.length - 1 
                      ? (isDarkTheme ? '1px solid #2d3748' : '1px solid #e5e7eb')
                      : 'none',
                    color: isDarkTheme ? '#d1d5db' : '#374151',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkTheme ? '#1f2937' : '#f9fafb';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{table}</span>
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{
            padding: '1rem',
            textAlign: 'center',
            color: isDarkTheme ? '#9ca3af' : '#6b7280',
            fontStyle: 'italic',
          }}>
            No tables found
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseTableList;