const { Pool } = require('pg');

class RunStatusDatabaseService {
  constructor() {
    // Store user-specific connections
    this.userConnections = new Map(); // userId -> { pool, isConnected, tables, config, etc. }
    this.refreshIntervals = new Map(); // userId -> intervalId
    this.maxConnectionAttempts = 5;
  }

  // Get user's database configuration from the RunStatus database
  async getUserConfig(userId) {
    try {
      // Connect to RunStatus database to get user's configuration
      const { Pool } = require('pg');
      const runStatusConfig = {
        host: 'localhost',
        port: 5432,
        database: 'runstatus',
        user: 'postgres',
        password: 'Welcom@123',
        max: 10,
        ssl: false
      };
      
      const pool = new Pool(runStatusConfig);
      const client = await pool.connect();
      
      try {
        const result = await client.query(
          'SELECT host, port, database_name, db_username, db_password FROM users_db_details WHERE user_id = $1 AND is_active = TRUE',
          [userId]
        );
        
        if (result.rows.length === 0) {
          return null; // No configuration found
        }
        
        const config = result.rows[0];
        return {
          host: config.host,
          port: config.port,
          database: config.database_name,
          user: config.db_username,
          password: config.db_password,
          refreshInterval: 1, // Default values
          max: 10,
          connectionTimeoutMillis: 30000,
          idleTimeoutMillis: 60000,
          ssl: false
        };
      } finally {
        client.release();
        await pool.end();
      }
    } catch (error) {
      console.error('Error loading user database config from RunStatus database:', error);
      return null;
    }
  }

  // Get user info (username and role) from the main database
  async getUserInfo(userId) {
    try {
      const { db } = require('../database');
      const result = await db.query(
        'SELECT username, role FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        username: result.rows[0].username,
        role: result.rows[0].role
      };
    } catch (error) {
      console.error('Error loading user info:', error);
      return null;
    }
  }

  // Initialize connection for a specific user
  async initializeUserConnection(userId) {
    console.log(`Initializing Run Status Database connection for user ${userId}...`);
    
    const config = await this.getUserConfig(userId);
    if (!config) {
      console.log(`No RunStatus DB configuration found for user ${userId}`);
      return false;
    }
    
    await this.connectUser(userId, config);
    this.startAutoRefreshForUser(userId);
    return true;
  }

  async connectUser(userId, config) {
    try {
      // Close existing connection if any
      if (this.userConnections.has(userId)) {
        const userConn = this.userConnections.get(userId);
        if (userConn.pool) {
          await userConn.pool.end();
        }
      }

      console.log(`Connecting to Run Status database for user ${userId}: ${config.host}:${config.port}/${config.database}`);
      
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        max: config.max,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
        idleTimeoutMillis: config.idleTimeoutMillis,
        ssl: config.ssl,
        min: 0,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 10000,
        reapIntervalMillis: 5000,
        createRetryIntervalMillis: 500,
        propagateCreateError: false
      });

      // Test the connection
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      // Store user connection
      const userConnection = {
        pool,
        isConnected: true,
        tables: [],
        config,
        lastRefresh: null,
        connectionAttempts: 0
      };
      
      this.userConnections.set(userId, userConnection);
      console.log(`Run Status database connected successfully for user ${userId}`);
      
      // Initial table refresh
      await this.refreshTablesForUser(userId);
      
    } catch (error) {
      console.error(`Run Status database connection failed for user ${userId}:`, error);
      
      const userConnection = this.userConnections.get(userId) || {};
      userConnection.isConnected = false;
      userConnection.connectionAttempts = (userConnection.connectionAttempts || 0) + 1;
      this.userConnections.set(userId, userConnection);
      
      // Retry connection with exponential backoff
      if (userConnection.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(5000 * Math.pow(2, userConnection.connectionAttempts - 1), 60000);
        console.log(`Retrying connection for user ${userId} in ${delay}ms... (attempt ${userConnection.connectionAttempts}/${this.maxConnectionAttempts})`);
        setTimeout(() => this.connectUser(userId, config), delay);
      } else {
        console.error(`Max connection attempts reached for user ${userId}. Run Status database service disabled.`);
      }
    }
  }

  async refreshTablesForUser(userId) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection || !userConnection.isConnected || !userConnection.pool) {
      console.log(`Database not connected for user ${userId}, skipping table refresh`);
      return;
    }

    try {
      console.log(`Refreshing Run Status database tables for user ${userId}...`);
      
      // Get user info to determine filtering
      const userInfo = await this.getUserInfo(userId);
      if (!userInfo) {
        console.error(`Could not get user info for user ${userId}`);
        return;
      }
      
      const client = await userConnection.pool.connect();
      
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
            // For non-admin users, check if table has run_name column and filter by username
            let shouldIncludeTable = true;
            
            if (userInfo.role !== 'admin') {
              // For regular users: exclude users_db_details table and tables without run_name column
              if (row.tablename === 'users_db_details') {
                shouldIncludeTable = false;
                console.log(`Excluding table ${row.tablename} for user ${userInfo.username} - system table`);
              } else {
                // Check if table has run_name column
                const hasRunNameQuery = `
                  SELECT column_name 
                  FROM information_schema.columns 
                  WHERE table_name = $1 AND table_schema = $2 AND column_name = 'run_name'
                `;
                const hasRunNameResult = await client.query(hasRunNameQuery, [row.tablename, row.schemaname]);
                
                if (hasRunNameResult.rows.length > 0) {
                  // Table has run_name column, check if any rows match the username
                  const matchQuery = `
                    SELECT COUNT(*) as match_count 
                    FROM "${row.tablename}" 
                    WHERE run_name LIKE $1
                  `;
                  const matchResult = await client.query(matchQuery, [`${userInfo.username}%`]);
                  const matchCount = parseInt(matchResult.rows[0].match_count);
                  
                  if (matchCount === 0) {
                    shouldIncludeTable = false;
                    console.log(`Excluding table ${row.tablename} for user ${userInfo.username} - no matching run_name records`);
                  } else {
                    console.log(`Including table ${row.tablename} for user ${userInfo.username} - found ${matchCount} matching records`);
                  }
                } else {
                  // Table doesn't have run_name column - exclude for regular users
                  shouldIncludeTable = false;
                  console.log(`Excluding table ${row.tablename} for user ${userInfo.username} - no run_name column`);
                }
              }
            } else {
              // Admin users see all tables
              console.log(`Admin user ${userInfo.username} - including table ${row.tablename}`);
            }
            
            if (!shouldIncludeTable) {
              continue;
            }
            
            // Get row count - user-specific for regular users, total for admin
            let rowCount;
            if (userInfo.role === 'admin') {
              // Admin sees total row count
              const countQuery = `SELECT COUNT(*) as row_count FROM "${row.tablename}"`;
              const countResult = await client.query(countQuery);
              rowCount = parseInt(countResult.rows[0].row_count);
            } else {
              // Regular users see only their data count (tables with run_name column only)
              const userCountQuery = `SELECT COUNT(*) as row_count FROM "${row.tablename}" WHERE run_name LIKE $1`;
              const userCountResult = await client.query(userCountQuery, [`${userInfo.username}%`]);
              rowCount = parseInt(userCountResult.rows[0].row_count);
            }
            
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
            console.warn(`Could not process table ${row.tablename} for user ${userId}:`, error.message);
            // For admin users or if we can't determine filtering, still add the table
            if (userInfo.role === 'admin') {
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
        }
        
        // Check for new tables
        const previousTableNames = userConnection.tables.map(t => t.table_name);
        const currentTableNames = newTables.map(t => t.table_name);
        const newTableNames = currentTableNames.filter(name => !previousTableNames.includes(name));
        
        if (newTableNames.length > 0) {
          console.log(`Found ${newTableNames.length} new tables for user ${userId} (${userInfo.username}):`, newTableNames);
        }
        
        userConnection.tables = newTables;
        userConnection.lastRefresh = new Date();
        
        console.log(`Refreshed ${userConnection.tables.length} tables from Run Status database for user ${userId} (${userInfo.username}, role: ${userInfo.role})`);
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error(`Error refreshing tables for user ${userId}:`, error);
      
      // If connection error, try to reconnect
      if (error.code === 'ECONNREFUSED' || error.message.includes('Connection terminated')) {
        console.log(`Connection lost for user ${userId}, attempting to reconnect...`);
        userConnection.isConnected = false;
        const config = await this.getUserConfig(userId);
        if (config) {
          this.connectUser(userId, config);
        }
      }
    }
  }

  startAutoRefreshForUser(userId) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection) return;

    // Clear existing interval if any
    if (this.refreshIntervals.has(userId)) {
      clearInterval(this.refreshIntervals.get(userId));
    }
    
    // Set up auto-refresh every minute (or configured interval)
    const intervalMs = userConnection.config.refreshInterval * 60 * 1000;
    console.log(`Starting auto-refresh for user ${userId} every ${userConnection.config.refreshInterval} minute(s)`);
    
    const intervalId = setInterval(async () => {
      if (userConnection.isConnected) {
        await this.refreshTablesForUser(userId);
      } else {
        console.log(`Database not connected for user ${userId}, attempting to reconnect...`);
        const config = await this.getUserConfig(userId);
        if (config) {
          await this.connectUser(userId, config);
        }
      }
    }, intervalMs);
    
    this.refreshIntervals.set(userId, intervalId);
  }

  stopAutoRefreshForUser(userId) {
    if (this.refreshIntervals.has(userId)) {
      clearInterval(this.refreshIntervals.get(userId));
      this.refreshIntervals.delete(userId);
      console.log(`Auto-refresh stopped for user ${userId}`);
    }
  }

  // Get users who have data in the database
  async getUsersWithData(userId) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection || !userConnection.isConnected) {
      return [];
    }

    try {
      const systemUsers = await this.getAllSystemUsers();
      const client = await userConnection.pool.connect();
      const usersWithData = [];

      try {
        // Check each system user against each table
        for (const systemUser of systemUsers) {
          let userTotalRuns = 0;
          const userTables = [];

          for (const table of userConnection.tables) {
            // Check if table has run_name column
            const hasRunNameQuery = `
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = $1 AND column_name = 'run_name'
            `;
            const hasRunNameResult = await client.query(hasRunNameQuery, [table.table_name]);
            
            if (hasRunNameResult.rows.length > 0) {
              // Check if this user has data in this table
              const userDataQuery = `
                SELECT COUNT(*) as count
                FROM "${table.table_name}" 
                WHERE run_name LIKE $1
              `;
              const userDataResult = await client.query(userDataQuery, [`${systemUser.username}%`]);
              const count = parseInt(userDataResult.rows[0].count);
              
              if (count > 0) {
                userTables.push({
                  ...table,
                  user_specific_count: count
                });
                userTotalRuns += count;
              }
            }
          }

          if (userTotalRuns > 0) {
            usersWithData.push({
              id: systemUser.id,
              username: systemUser.username,
              role: systemUser.role,
              totalRuns: userTotalRuns,
              tables: userTables
            });
          }
        }

        return usersWithData;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error getting users with data for user ${userId}:`, error);
      return [];
    }
  }

  // Get all system users to match with run_name data
  async getAllSystemUsers() {
    try {
      const { db } = require('../database');
      const result = await db.query('SELECT id, username, role FROM users ORDER BY username');
      return result.rows;
    } catch (error) {
      console.error('Error loading system users:', error);
      return [];
    }
  }

  getTablesForUser(userId) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection) {
      return {
        tables: [],
        isConnected: false,
        lastRefresh: null,
        totalTables: 0
      };
    }

    return {
      tables: userConnection.tables,
      isConnected: userConnection.isConnected,
      lastRefresh: userConnection.lastRefresh,
      totalTables: userConnection.tables.length
    };
  }

  getConnectionStatusForUser(userId) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection) {
      return {
        isConnected: false,
        host: null,
        port: null,
        database: null,
        lastRefresh: null,
        totalTables: 0,
        refreshInterval: 1
      };
    }

    return {
      isConnected: userConnection.isConnected,
      host: userConnection.config.host,
      port: userConnection.config.port,
      database: userConnection.config.database,
      lastRefresh: userConnection.lastRefresh,
      totalTables: userConnection.tables.length,
      refreshInterval: userConnection.config.refreshInterval
    };
  }

  async getTableDataForUser(userId, tableName, limit = 100) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection || !userConnection.isConnected || !userConnection.pool) {
      throw new Error('Database not connected');
    }

    try {
      // Get user info to determine filtering
      const userInfo = await this.getUserInfo(userId);
      if (!userInfo) {
        throw new Error('Could not get user info');
      }

      const client = await userConnection.pool.connect();
      
      try {
        let dataQuery = `SELECT * FROM "${tableName}"`;
        let queryParams = [];
        
        // For non-admin users, filter by run_name if the column exists
        if (userInfo.role !== 'admin') {
          // Check if table has run_name column
          const hasRunNameQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = 'run_name'
          `;
          const hasRunNameResult = await client.query(hasRunNameQuery, [tableName]);
          
          if (hasRunNameResult.rows.length > 0) {
            dataQuery += ` WHERE run_name LIKE $1`;
            queryParams.push(`${userInfo.username}%`);
          }
        }
        
        dataQuery += ` LIMIT $${queryParams.length + 1}`;
        queryParams.push(limit);
        
        const result = await client.query(dataQuery, queryParams);
        
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
      console.error(`Error getting data for table ${tableName} for user ${userId}:`, error);
      throw error;
    }
  }

  async executeQueryForUser(userId, query, params = []) {
    const userConnection = this.userConnections.get(userId);
    if (!userConnection || !userConnection.isConnected || !userConnection.pool) {
      throw new Error('Database not connected');
    }

    try {
      const client = await userConnection.pool.connect();
      
      try {
        const result = await client.query(query, params);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error executing query for user ${userId}:`, error);
      throw error;
    }
  }

  async disconnectUser(userId) {
    this.stopAutoRefreshForUser(userId);
    
    const userConnection = this.userConnections.get(userId);
    if (userConnection && userConnection.pool) {
      try {
        await userConnection.pool.end();
        console.log(`Run Status database disconnected for user ${userId}`);
      } catch (error) {
        console.error(`Error disconnecting from database for user ${userId}:`, error);
      }
    }
    
    this.userConnections.delete(userId);
  }

  // Method to reload configuration and reconnect for a user
  async reloadUserConfig(userId) {
    console.log(`Reloading Run Status Database configuration for user ${userId}...`);
    await this.disconnectUser(userId);
    await this.initializeUserConnection(userId);
  }
}

// Create singleton instance
const runStatusDbService = new RunStatusDatabaseService();

module.exports = runStatusDbService;