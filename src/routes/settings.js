const express = require('express');
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const { db } = require('../database');
const { Pool } = require('pg');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Get config path
const configPath = process.env.CONFIG_PATH || path.resolve('./conf/config.ini');

// Function to read config.ini
function readConfig() {
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return ini.parse(configContent);
  } catch (error) {
    console.error('Error reading config.ini:', error);
    return null;
  }
}

// Function to write to config.ini
function writeConfig(config) {
  try {
    const configString = ini.stringify(config);
    fs.writeFileSync(configPath, configString);
    return true;
  } catch (error) {
    console.error('Error writing to config.ini:', error);
    return false;
  }
}

// Update theme in config.ini
router.post('/theme', isAuthenticated, async (req, res) => {
  const { theme } = req.body;
  
  if (!theme) {
    return res.status(400).json({ error: 'Theme is required' });
  }
  
  try {
    const config = readConfig();
    
    if (!config) {
      return res.status(500).json({ error: 'Could not read configuration file' });
    }
    
    // Ensure frontend section exists
    if (!config.frontend) {
      config.frontend = {};
    }
    
    // Update theme setting
    config.frontend.theme = theme;
    
    // Write back to config.ini
    const success = writeConfig(config);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to save theme to configuration' });
    }
    
    // Also store user preference in database
    try {
      // Check if user_settings table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'").get();
      
      if (!tableExists) {
        // Create user_settings table
        db.exec(`
          CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            theme TEXT,
            api_key TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `);
      }
      
      // Update or insert user theme preference
      const existingSettings = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(req.session.userId);
      
      if (existingSettings) {
        db.prepare('UPDATE user_settings SET theme = ? WHERE user_id = ?').run(theme, req.session.userId);
      } else {
        db.prepare('INSERT INTO user_settings (user_id, theme) VALUES (?, ?)').run(req.session.userId, theme);
      }
    } catch (dbError) {
      console.error('Database error when saving theme:', dbError);
      // Continue even if DB update fails
    }
    
    res.status(200).json({ message: 'Theme updated successfully' });
  } catch (error) {
    console.error('Error updating theme:', error);
    res.status(500).json({ error: 'Failed to update theme setting' });
  }
});

// Get current theme setting
router.get('/theme', isAuthenticated, async (req, res) => {
  try {
    const config = readConfig();
    
    if (!config || !config.frontend) {
      return res.status(200).json({ theme: 'dark' }); // Default theme
    }
    
    // Return theme from config.ini or default to dark
    res.status(200).json({ theme: config.frontend.theme || 'dark' });
  } catch (error) {
    console.error('Error getting theme:', error);
    res.status(500).json({ error: 'Failed to get theme setting' });
  }
});

// Save API key
router.post('/api-key', isAuthenticated, (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  
  try {
    // Check if user_settings table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'").get();
    
    if (!tableExists) {
      // Create user_settings table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY,
          theme TEXT,
          api_key TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);
    }
    
    // Update or insert user API key
    const existingSettings = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(req.session.userId);
    
    if (existingSettings) {
      db.prepare('UPDATE user_settings SET api_key = ? WHERE user_id = ?').run(apiKey, req.session.userId);
    } else {
      db.prepare('INSERT INTO user_settings (user_id, api_key) VALUES (?, ?)').run(req.session.userId, apiKey);
    }
    
    res.json({ message: 'API key saved successfully' });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get API key
router.get('/api-key', isAuthenticated, (req, res) => {
  try {
    const settings = db.prepare('SELECT api_key FROM user_settings WHERE user_id = ?').get(req.session.userId);
    res.json({ apiKey: settings?.api_key || '' });
  } catch (error) {
    console.error('Error getting API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get RunStatus DB configuration
router.get('/runstatus-db/config', isAuthenticated, async (req, res) => {
  try {
    const { db } = require('../database');
    
    // Get user's active RunStatus DB configuration
    const result = await db.query(
      'SELECT host, port, database_name, username, password FROM user_runstatus_db_configurations WHERE user_id = $1 AND is_active = TRUE',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        config: {
          host: 'localhost',
          port: 5432,
          database: 'runstatus',
          user: 'postgres',
          password: ''
        }
      });
    }
    
    const dbConfig = result.rows[0];
    res.json({
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database_name,
        user: dbConfig.username,
        password: dbConfig.password
      }
    });
  } catch (error) {
    console.error('Error getting RunStatus DB config:', error);
    res.status(500).json({ error: 'Failed to get RunStatus DB configuration' });
  }
});

// Get RunStatus DB configuration
router.get('/runstatus-db/config', isAuthenticated, async (req, res) => {
  try {
    const { db } = require('../database');
    
    const result = await db.query(
      'SELECT host, port, database_name, username FROM user_runstatus_db_configurations WHERE user_id = $1 AND is_active = TRUE',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        config: {
          host: '',
          port: 5432,
          database: '',
          user: '',
          password: ''
        }
      });
    }
    
    const config = result.rows[0];
    res.json({ 
      success: true, 
      config: {
        host: config.host,
        port: config.port,
        database: config.database_name,
        user: config.username,
        password: '' // Never return password
      }
    });
    
  } catch (error) {
    console.error('Error loading RunStatus DB configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load RunStatus DB configuration' 
    });
  }
});

// Test RunStatus DB connection
router.post('/runstatus-db/test', isAuthenticated, async (req, res) => {
  const { host, port, database, user, password } = req.body;
  
  if (!host || !port || !database || !user || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'All database connection fields are required' 
    });
  }
  
  let testPool = null;
  
  try {
    // Create a test connection pool
    testPool = new Pool({
      host,
      port: parseInt(port),
      database,
      user,
      password,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      ssl: false
    });
    
    // Test the connection
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Connection test successful' 
    });
    
  } catch (error) {
    console.error('RunStatus DB connection test failed:', error);
    res.status(400).json({ 
      success: false, 
      error: `Connection test failed: ${error.message}` 
    });
  } finally {
    if (testPool) {
      try {
        await testPool.end();
      } catch (error) {
        console.error('Error closing test pool:', error);
      }
    }
  }
});

// Save RunStatus DB configuration
router.post('/runstatus-db/config', isAuthenticated, async (req, res) => {
  const { host, port, database, user, password } = req.body;
  
  if (!host || !port || !database || !user || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'All database connection fields are required' 
    });
  }
  
  try {
    const { db } = require('../database');
    
    // Start a transaction
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Deactivate any existing configurations for this user
      await client.query(
        'UPDATE user_runstatus_db_configurations SET is_active = FALSE WHERE user_id = $1',
        [req.session.userId]
      );
      
      // Insert new configuration
      await client.query(`
        INSERT INTO user_runstatus_db_configurations 
        (user_id, host, port, database_name, username, password, is_active) 
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      `, [req.session.userId, host, port, database, user, password]);
      
      await client.query('COMMIT');
      
      // Notify the RunStatus DB service to reconnect with new configuration
      try {
        const runStatusDbService = require('../services/runStatusDbService');
        setTimeout(() => {
          runStatusDbService.reloadUserConfig(req.session.userId).catch(error => {
            console.error('Error reloading RunStatus DB service config:', error);
          });
        }, 1000);
      } catch (serviceError) {
        console.error('Error notifying RunStatus DB service:', serviceError);
        // Continue even if service notification fails
      }
      
      res.json({ 
        success: true, 
        message: 'RunStatus DB configuration saved successfully. The service will reconnect automatically.' 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error saving RunStatus DB configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save RunStatus DB configuration' 
    });
  }
});

// Disconnect RunStatus DB
router.post('/runstatus-db/disconnect', isAuthenticated, async (req, res) => {
  try {
    const { db } = require('../database');
    
    // Start a transaction
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Deactivate all configurations for this user
      await client.query(
        'UPDATE user_runstatus_db_configurations SET is_active = FALSE WHERE user_id = $1',
        [req.session.userId]
      );
      
      await client.query('COMMIT');
      
      // Disconnect the user from the RunStatus DB service
      try {
        const runStatusDbService = require('../services/runStatusDbService');
        await runStatusDbService.disconnectUser(req.session.userId);
      } catch (serviceError) {
        console.error('Error disconnecting RunStatus DB service:', serviceError);
        // Continue even if service disconnection fails
      }
      
      res.json({ 
        success: true, 
        message: 'RunStatus DB disconnected successfully.' 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error disconnecting RunStatus DB:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to disconnect RunStatus DB' 
    });
  }
});

// Save user database configuration to users_db_details table in RunStatus database
router.post('/user-db-details/save', isAuthenticated, async (req, res) => {
  const { host, port, database, user, password } = req.body;
  
  // Validate required fields
  if (!host || !port || !database || !user || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'All fields are required: host, port, database, user, password' 
    });
  }

  try {
    // Connect to RunStatus database
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
      await client.query('BEGIN');
      
      // Get username from main database for the user_id
      const { db } = require('../database');
      const userResult = await db.query('SELECT username FROM users WHERE id = $1', [req.session.userId]);
      const username = userResult.rows[0]?.username || req.session.userId;
      
      // First, deactivate any existing active configurations for this user
      await client.query(
        'UPDATE users_db_details SET is_active = FALSE WHERE user_id = $1',
        [req.session.userId]
      );
      
      // Insert new configuration into RunStatus database
      await client.query(`
        INSERT INTO users_db_details (user_id, username, host, port, database_name, db_username, db_password, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [req.session.userId, username, host, port, database, user, password]);
      
      await client.query('COMMIT');
      
      console.log(`Database configuration saved for user ${req.session.userId} (${username}) in RunStatus database`);
      
      res.json({ 
        success: true, 
        message: 'Connected Successfully! Database configuration saved.' 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('Error saving user database configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save database configuration' 
    });
  }
});

// Get user database configuration from users_db_details table in RunStatus database
router.get('/user-db-details/config', isAuthenticated, async (req, res) => {
  try {
    // Connect to RunStatus database
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
        'SELECT host, port, database_name, db_username FROM users_db_details WHERE user_id = $1 AND is_active = TRUE',
        [req.session.userId]
      );
      
      if (result.rows.length === 0) {
        return res.json({ 
          success: true, 
          config: {
            host: '',
            port: 5432,
            database: '',
            user: '',
            password: ''
          }
        });
      }
      
      const config = result.rows[0];
      res.json({ 
        success: true, 
        config: {
          host: config.host,
          port: config.port,
          database: config.database_name,
          user: config.db_username,
          password: '' // Never return password for security
        }
      });
      
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('Error loading user database configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load database configuration' 
    });
  }
});

// Disconnect user database configuration from RunStatus database
router.post('/user-db-details/disconnect', isAuthenticated, async (req, res) => {
  try {
    // Connect to RunStatus database
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
      await client.query('BEGIN');
      
      // Deactivate all configurations for this user
      await client.query(
        'UPDATE users_db_details SET is_active = FALSE WHERE user_id = $1',
        [req.session.userId]
      );
      
      await client.query('COMMIT');
      
      console.log(`Database configuration disconnected for user ${req.session.userId} in RunStatus database`);
      
      res.json({ 
        success: true, 
        message: 'Database disconnected successfully.' 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('Error disconnecting user database:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to disconnect database' 
    });
  }
});

module.exports = router; 