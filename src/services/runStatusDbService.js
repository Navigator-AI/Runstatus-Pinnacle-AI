const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../../conf/config.ini');

class RunStatusDatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.tables = [];
    this.refreshInterval = null;
    this.config = this.loadConfig();
    this.lastRefresh = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // Initialize the service
    this.initialize();
  }

  loadConfig() {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = {};
      let currentSection = null;

      configContent.split('\n').forEach(line => {
        line = line.trim();
        if (line.startsWith('[') && line.endsWith(']')) {
          currentSection = line.slice(1, -1);
        } else if (line && !line.startsWith('#') && currentSection === 'runstatus_database') {
          const [key, value] = line.split('=').map(s => s.trim());
          if (key && value) {
            config[key] = value;
          }
        }
      });

      return {
        host: config.DB_HOST || 'localhost',
        port: parseInt(config.DB_PORT) || 5432,
        database: config.DB_NAME || 'runstatus',
        user: config.DB_USER || 'postgres',
        password: config.DB_PASSWORD || 'Welcom@123',
        refreshInterval: parseInt(config.refresh_interval_minutes) || 1,
        max: parseInt(config.max_connections) || 10,
        connectionTimeoutMillis: parseInt(config.connection_timeout_ms) || 30000,
        idleTimeoutMillis: parseInt(config.idle_timeout_ms) || 60000,
        ssl: config.ssl === 'true' ? true : false
      };
    } catch (error) {
      console.error('Error loading Run Status database config:', error);
      // Return default configuration
      return {
        host: 'localhost',
        port: 5432,
        database: 'runstatus',
        user: 'postgres',
        password: 'Welcom@123',
        refreshInterval: 1,
        max: 10,
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 60000,
        ssl: false
      };
    }
  }

  async initialize() {
    console.log('Initializing Run Status Database Service...');
    await this.connect();
    this.startAutoRefresh();
  }

  async connect() {
    try {
      if (this.pool) {
        await this.pool.end();
      }

      console.log(`Connecting to Run Status database: ${this.config.host}:${this.config.port}/${this.config.database}`);
      
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: this.config.max,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        ssl: this.config.ssl,
        min: 0,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 10000,
        reapIntervalMillis: 5000,
        createRetryIntervalMillis: 500,
        propagateCreateError: false
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isConnected = true;
      this.connectionAttempts = 0;
      console.log('Run Status database connected successfully');
      
      // Initial table refresh
      await this.refreshTables();
      
    } catch (error) {
      console.error('Run Status database connection failed:', error);
      this.isConnected = false;
      this.connectionAttempts++;
      
      // Retry connection with exponential backoff
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(5000 * Math.pow(2, this.connectionAttempts - 1), 60000);
        console.log(`Retrying connection in ${delay}ms... (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
        setTimeout(() => this.connect(), delay);
      } else {
        console.error('Max connection attempts reached. Run Status database service disabled.');
      }
    }
  }

  async refreshTables() {
    if (!this.isConnected || !this.pool) {
      console.log('Database not connected, skipping table refresh');
      return;
    }

    try {
      console.log('Refreshing Run Status database tables...');
      
      const client = await this.pool.connect();
      
      try {
        // Get all tables from the runstatus database
        const tablesQuery = `
          SELECT 
            schemaname,
            tablename,
            tableowner,
            hasindexes,
            hasrules,
            hastriggers
          FROM pg_tables 
          WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
          ORDER BY tablename;
        `;
        
        const tablesResult = await client.query(tablesQuery);
        const newTables = [];
        
        for (let row of tablesResult.rows) {
          try {
            // Get row count for each table
            const countQuery = `SELECT COUNT(*) as row_count FROM "${row.tablename}"`;
            const countResult = await client.query(countQuery);
            const rowCount = parseInt(countResult.rows[0].row_count);
            
            // Get column information
            const columnsQuery = `
              SELECT column_name, data_type
              FROM information_schema.columns 
              WHERE table_name = $1 AND table_schema = $2
              ORDER BY ordinal_position;
            `;
            const columnsResult = await client.query(columnsQuery, [row.tablename, row.schemaname]);
            const columns = columnsResult.rows.map(col => col.column_name);
            
            newTables.push({
              id: `table_${row.tablename}`,
              filename: `${row.tablename}.table`,
              table_name: row.tablename,
              schema_name: row.schemaname,
              upload_date: new Date().toISOString().split('T')[0],
              file_size: `${rowCount} rows`,
              file_type: 'PostgreSQL Table',
              owner: row.tableowner,
              has_indexes: row.hasindexes,
              has_rules: row.hasrules,
              has_triggers: row.hastriggers,
              row_count: rowCount,
              columns: columns,
              last_updated: new Date().toISOString()
            });
          } catch (error) {
            console.warn(`Could not process table ${row.tablename}:`, error.message);
            // Still add the table even if we can't get details
            newTables.push({
              id: `table_${row.tablename}`,
              filename: `${row.tablename}.table`,
              table_name: row.tablename,
              schema_name: row.schemaname,
              upload_date: new Date().toISOString().split('T')[0],
              file_size: 'Unknown',
              file_type: 'PostgreSQL Table',
              owner: row.tableowner,
              row_count: 0,
              columns: [],
              last_updated: new Date().toISOString()
            });
          }
        }
        
        // Check for new tables
        const previousTableNames = this.tables.map(t => t.table_name);
        const currentTableNames = newTables.map(t => t.table_name);
        const newTableNames = currentTableNames.filter(name => !previousTableNames.includes(name));
        
        if (newTableNames.length > 0) {
          console.log(`Found ${newTableNames.length} new tables:`, newTableNames);
        }
        
        this.tables = newTables;
        this.lastRefresh = new Date();
        
        console.log(`Refreshed ${this.tables.length} tables from Run Status database`);
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Error refreshing tables:', error);
      
      // If connection error, try to reconnect
      if (error.code === 'ECONNREFUSED' || error.message.includes('Connection terminated')) {
        console.log('Connection lost, attempting to reconnect...');
        this.isConnected = false;
        this.connect();
      }
    }
  }

  startAutoRefresh() {
    // Clear existing interval if any
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Set up auto-refresh every minute (or configured interval)
    const intervalMs = this.config.refreshInterval * 60 * 1000;
    console.log(`Starting auto-refresh every ${this.config.refreshInterval} minute(s)`);
    
    this.refreshInterval = setInterval(async () => {
      if (this.isConnected) {
        await this.refreshTables();
      } else {
        console.log('Database not connected, attempting to reconnect...');
        await this.connect();
      }
    }, intervalMs);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Auto-refresh stopped');
    }
  }

  getTables() {
    return {
      tables: this.tables,
      isConnected: this.isConnected,
      lastRefresh: this.lastRefresh,
      totalTables: this.tables.length
    };
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      lastRefresh: this.lastRefresh,
      totalTables: this.tables.length,
      refreshInterval: this.config.refreshInterval
    };
  }

  async getTableData(tableName, limit = 100) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      
      try {
        // Get table data with limit
        const dataQuery = `SELECT * FROM "${tableName}" LIMIT $1`;
        const result = await client.query(dataQuery, [limit]);
        
        return {
          table_name: tableName,
          data: result.rows,
          total_returned: result.rows.length,
          columns: result.fields ? result.fields.map(f => f.name) : []
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error getting data for table ${tableName}:`, error);
      throw error;
    }
  }

  async executeQuery(query, params = []) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      
      try {
        const result = await client.query(query, params);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  async disconnect() {
    this.stopAutoRefresh();
    
    if (this.pool) {
      try {
        await this.pool.end();
        console.log('Run Status database disconnected');
      } catch (error) {
        console.error('Error disconnecting from database:', error);
      }
    }
    
    this.isConnected = false;
    this.pool = null;
    this.tables = [];
  }
}

// Create singleton instance
const runStatusDbService = new RunStatusDatabaseService();

module.exports = runStatusDbService;