import axios from 'axios';

interface TableData {
  data: any[];
  columns: string[];
  error?: string;
}

export const databaseService = {
  /**
   * Get a list of all tables in the database
   */
  async getAllTables(): Promise<string[]> {
    try {
      const response = await axios.post('/api/chat2sql/execute', {
        query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      });
      
      if (response.data && response.data.error) {
        console.error('Error fetching tables:', response.data.error);
        return [];
      }
      
      // Extract table names from the response
      if (response.data && response.data.data) {
        // The data might be in markdown format, so we need to parse it
        const tableNames: string[] = [];
        
        // If it's a markdown table, extract the table names
        if (typeof response.data.data === 'string' && response.data.data.includes('|')) {
          const lines = response.data.data.split('\n');
          // Skip header and separator lines (first 2-3 lines)
          for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
              const columns = line.split('|').map(col => col.trim()).filter(Boolean);
              if (columns.length > 0) {
                tableNames.push(columns[0]);
              }
            }
          }
        } 
        // If it's a direct array of objects
        else if (Array.isArray(response.data.data)) {
          response.data.data.forEach((row: any) => {
            if (row.table_name) {
              tableNames.push(row.table_name);
            }
          });
        }
        
        return tableNames;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching tables:', error);
      return [];
    }
  },
  
  /**
   * Get data from a specific table
   */
  async getTableData(tableName: string, limit: number = 100): Promise<TableData> {
    try {
      const response = await axios.post('/api/chat2sql/execute', {
        query: `SELECT * FROM ${tableName} LIMIT ${limit}`
      });
      
      if (response.data && response.data.error) {
        console.error(`Error fetching data from table ${tableName}:`, response.data.error);
        return { data: [], columns: [], error: response.data.error };
      }
      
      // Extract data and columns from the response
      if (response.data) {
        // If the response contains direct data and columns
        if (Array.isArray(response.data.data) && Array.isArray(response.data.columns)) {
          return {
            data: response.data.data,
            columns: response.data.columns
          };
        }
        
        // If the data is in markdown format, parse it
        if (typeof response.data.data === 'string' && response.data.data.includes('|')) {
          const lines = response.data.data.split('\n');
          const data: any[] = [];
          let columns: string[] = [];
          
          // Parse the markdown table
          let headerFound = false;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Process only lines that look like table rows
            if (line.startsWith('|') && line.endsWith('|')) {
              const rowValues = line.split('|')
                .map(cell => cell.trim())
                .filter(cell => cell !== '');
              
              // First row with | is the header
              if (!headerFound) {
                columns = rowValues;
                headerFound = true;
              } 
              // Skip the separator row (contains only dashes)
              else if (!rowValues.every(cell => /^-+$/.test(cell))) {
                // Create an object with column names as keys
                const rowData: any = {};
                rowValues.forEach((value, index) => {
                  if (index < columns.length) {
                    rowData[columns[index]] = value;
                  }
                });
                data.push(rowData);
              }
            }
          }
          
          return { data, columns };
        }
      }
      
      return { data: [], columns: [] };
    } catch (error) {
      console.error(`Error fetching data from table ${tableName}:`, error);
      return { data: [], columns: [], error: 'Failed to fetch table data' };
    }
  },
  
  /**
   * Get the structure of a specific table
   */
  async getTableStructure(tableName: string): Promise<TableData> {
    try {
      const response = await axios.post('/api/chat2sql/execute', {
        query: `DESCRIBE_TABLE:${tableName}`
      });
      
      if (response.data && response.data.error) {
        console.error(`Error fetching structure for table ${tableName}:`, response.data.error);
        return { data: [], columns: [], error: response.data.error };
      }
      
      // Extract structure data from the response
      if (response.data) {
        // If the response contains direct data and columns
        if (Array.isArray(response.data.data) && Array.isArray(response.data.columns)) {
          return {
            data: response.data.data,
            columns: response.data.columns
          };
        }
        
        // If the data is in markdown format, parse it
        if (typeof response.data.data === 'string' && response.data.data.includes('|')) {
          const lines = response.data.data.split('\n');
          const data: any[] = [];
          let columns: string[] = [];
          
          // Parse the markdown table
          let headerFound = false;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Process only lines that look like table rows
            if (line.startsWith('|') && line.endsWith('|')) {
              const rowValues = line.split('|')
                .map(cell => cell.trim())
                .filter(cell => cell !== '');
              
              // First row with | is the header
              if (!headerFound) {
                columns = rowValues;
                headerFound = true;
              } 
              // Skip the separator row (contains only dashes)
              else if (!rowValues.every(cell => /^-+$/.test(cell))) {
                // Create an object with column names as keys
                const rowData: any = {};
                rowValues.forEach((value, index) => {
                  if (index < columns.length) {
                    rowData[columns[index]] = value;
                  }
                });
                data.push(rowData);
              }
            }
          }
          
          return { data, columns };
        }
      }
      
      return { data: [], columns: [] };
    } catch (error) {
      console.error(`Error fetching structure for table ${tableName}:`, error);
      return { data: [], columns: [], error: 'Failed to fetch table structure' };
    }
  }
};

export default databaseService;