import React, { useState, useEffect } from 'react';
import { databaseService } from '../../services/databaseService';
import DatabaseTableList from '../DatabaseTableList';
import DatabaseTableViewer from '../DatabaseTableViewer';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  TableCellsIcon, 
  ArrowPathIcon, 
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface DatabaseTableDisplayProps {
  initialTableName?: string;
  showAllTables?: boolean;
}

const DatabaseTableDisplay: React.FC<DatabaseTableDisplayProps> = ({
  initialTableName,
  showAllTables = false
}) => {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(initialTableName || null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { currentTheme } = useTheme();
  const isDarkTheme = currentTheme !== 'light';

  // Fetch all tables on component mount
  useEffect(() => {
    fetchAllTables();
  }, []);

  // Fetch table data when a table is selected
  useEffect(() => {
    if (selectedTable) {
      fetchTableData(selectedTable);
    }
  }, [selectedTable]);

  const fetchAllTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const tableList = await databaseService.getAllTables();
      setTables(tableList);
      
      // If we have tables and no table is selected, select the first one
      if (tableList.length > 0 && !selectedTable && !initialTableName) {
        setSelectedTable(tableList[0]);
      }
    } catch (err) {
      console.error('Error fetching tables:', err);
      setError('Failed to fetch database tables');
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async (tableName: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await databaseService.getTableData(tableName);
      
      if (result.error) {
        setError(result.error);
        setTableData([]);
        setTableColumns([]);
      } else {
        setTableData(result.data);
        setTableColumns(result.columns);
      }
    } catch (err) {
      console.error(`Error fetching data for table ${tableName}:`, err);
      setError(`Failed to fetch data for table ${tableName}`);
      setTableData([]);
      setTableColumns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
  };

  const handleRefresh = () => {
    if (selectedTable) {
      fetchTableData(selectedTable);
    } else {
      fetchAllTables();
    }
  };

  return (
    <div className="database-table-display" style={{
      marginTop: '1rem',
      marginBottom: '1rem',
    }}>
      {/* Show all tables if requested */}
      {showAllTables && (
        <DatabaseTableList 
          tables={tables} 
          onSelectTable={handleSelectTable} 
          isDarkTheme={isDarkTheme} 
        />
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: isDarkTheme ? '#1e2333' : '#f9fafb',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
        }}>
          <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" style={{ color: isDarkTheme ? '#9ca3af' : '#4b5563' }} />
          <span style={{ color: isDarkTheme ? '#e5e7eb' : '#111827' }}>Loading...</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1rem',
          backgroundColor: isDarkTheme ? '#7f1d1d' : '#fee2e2',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          color: isDarkTheme ? '#fecaca' : '#991b1b',
        }}>
          <ExclamationCircleIcon className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      )}

      {/* No tables message */}
      {!loading && !error && tables.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1rem',
          backgroundColor: isDarkTheme ? '#1e2333' : '#f9fafb',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          color: isDarkTheme ? '#9ca3af' : '#6b7280',
        }}>
          <InformationCircleIcon className="w-5 h-5 mr-2" />
          <span>No tables found in the database</span>
        </div>
      )}

      {/* Table data display */}
      {!loading && !error && selectedTable && tableColumns.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <TableCellsIcon className="w-5 h-5" style={{ color: isDarkTheme ? '#9ca3af' : '#4b5563' }} />
              <h3 style={{ 
                margin: 0, 
                fontSize: '1rem', 
                fontWeight: 600,
                color: isDarkTheme ? '#e5e7eb' : '#111827',
              }}>
                Table: {selectedTable}
              </h3>
            </div>
            <button
              onClick={handleRefresh}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: isDarkTheme ? '#374151' : '#f3f4f6',
                color: isDarkTheme ? '#e5e7eb' : '#4b5563',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              <ArrowPathIcon className="w-4 h-4 mr-1" />
              Refresh
            </button>
          </div>
          
          <DatabaseTableViewer
            tableName={selectedTable}
            data={tableData}
            columns={tableColumns}
            maxHeight={400}
            isDarkTheme={isDarkTheme}
          />
        </div>
      )}
    </div>
  );
};

export default DatabaseTableDisplay;