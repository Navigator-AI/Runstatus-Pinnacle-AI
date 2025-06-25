const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  // For testing purposes, we'll allow unauthenticated access
  // In production, you should uncomment the authentication check
  // if (req.session.userId) {
  //   next();
  // } else {
  //   res.status(401).json({ error: 'Unauthorized' });
  // }
  next();
};

// Parse natural language queries to SQL
function parseNaturalLanguageQuery(text) {
  // Clean up the input text
  const cleanedText = text.trim().replace(/;$/, '');
  
  console.log(`Parsing natural language query: "${cleanedText}"`);
  
  // Direct handling for the problematic query
  if (cleanedText.toLowerCase().match(/fetch all( the)? from (\w+)( table)?/i)) {
    const match = cleanedText.toLowerCase().match(/fetch all( the)? from (\w+)( table)?/i);
    const tableName = match[2];
    console.log(`Direct handling for problematic query, table name: ${tableName}`);
    return `SELECT * FROM ${tableName}`;
  }
  
  // If it already looks like SQL, don't modify it
  if (cleanedText.toLowerCase().startsWith('select ')) {
    return cleanedText;
  }
  
  // Match patterns for getting all data from a table
  const fetchAllDataPatterns = [
    /fetch all( the)? data from (\w+)( table)?/i,
    /fetch all( the)? from (\w+)( table)?/i,  // Handle missing "data" keyword
    /show all data from (\w+)( table)?/i,
    /get all( the)? data from (\w+)( table)?/i,
    /select all from (\w+)( table)?/i,
    /display all( the)? (records|rows) from (\w+)( table)?/i,
    /show me all( the)? (records|rows) in (\w+)( table)?/i,
    /show (\w+)( table)?/i
  ];
  
  // First check for patterns with LIMIT
  const limitPattern = /show (\d+) (rows|records) from (\w+)|get (\d+) (rows|records) from (\w+)|show top (\d+) from (\w+)/i;
  const limitMatch = cleanedText.match(limitPattern);
  if (limitMatch) {
    // Extract limit and table name
    const limit = limitMatch[1] || limitMatch[4] || limitMatch[7];
    const tableName = limitMatch[3] || limitMatch[6] || limitMatch[8];
    if (limit && tableName) {
      return `SELECT * FROM ${tableName} LIMIT ${limit}`;
    }
  }
  
  // Check for patterns with WHERE clauses for simple filtering
  const wherePattern = /show (\w+) where (\w+) ?([=<>]) ?([^;]+)/i;
  const whereMatch = cleanedText.match(wherePattern);
  if (whereMatch) {
    const tableName = whereMatch[1];
    const column = whereMatch[2];
    const operator = whereMatch[3];
    let value = whereMatch[4].trim();
    
    // Add quotes for string values
    if (!value.match(/^\d+(\.\d+)?$/) && !value.match(/^true|false$/i)) {
      value = `'${value}'`;
    }
    
    console.log(`Parsed WHERE clause - Table: ${tableName}, Column: ${column}, Operator: ${operator}, Value: ${value}`);
    return `SELECT * FROM ${tableName} WHERE ${column} ${operator} ${value}`;
  }
  
  // Regular table data patterns
  for (const pattern of fetchAllDataPatterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      console.log(`Found match for pattern: ${pattern}`);
      console.log(`Match groups:`, match);
      
      // Extract table name - this is more complicated since patterns vary
      let tableName = null;
      
      // Try all possible positions where the table name might be
      for (let i = 1; i < match.length; i++) {
        if (match[i] && !match[i].match(/^(all|the|data|table|rows|records)$/i)) {
          tableName = match[i];
          console.log(`Found potential table name at position ${i}: ${tableName}`);
          break;
        }
      }
      
      if (tableName) {
        console.log(`Final parsed table name: ${tableName}`);
        return `SELECT * FROM ${tableName}`;
      }
    }
  }
  
  // Match "show all tables" pattern
  if (/show all tables|list( all)? tables|what tables (exist|are there|do you have)/i.test(cleanedText)) {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name";
  }
  
  // Match "show tables" pattern (simplified version)
  if (/^show tables$|^tables$|^list tables$|^get tables$/i.test(cleanedText)) {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name";
  }
  
  // Count tables pattern
  if (/how many tables|count( of)? tables/i.test(cleanedText)) {
    return "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'";
  }
  
  // Count rows pattern
  const countRowsPattern = /how many (rows|records) in (\w+)|count (rows|records) in (\w+)|count (\w+)/i;
  const countRowsMatch = cleanedText.match(countRowsPattern);
  if (countRowsMatch) {
    const tableName = countRowsMatch[2] || countRowsMatch[4] || countRowsMatch[5];
    if (tableName) {
      return `SELECT COUNT(*) FROM ${tableName}`;
    }
  }
  
  // Match "describe table X" pattern - be very specific to avoid false positives
  const describePattern = /^describe (table )?(\w+)$|^show structure of (\w+)$|^what (columns|fields) (are in|does) (\w+) (have|contain)$/i;
  const describeMatch = cleanedText.match(describePattern);
  if (describeMatch) {
    const tableName = describeMatch[2] || describeMatch[3] || describeMatch[6];
    if (tableName) {
      console.log(`Parsed describe table query - Table: ${tableName}`);
      
      // We'll prepend a special marker to indicate this is a describe operation
      return `DESCRIBE_TABLE:${tableName}`;
    }
  }
  
  // Special handling for sessions table
  if (/sessions structure|structure of sessions|describe sessions/i.test(cleanedText)) {
    return `DESCRIBE_TABLE:sessions`;
  }
  
  // Add direct "sample data" command
  const sampleDataPattern = /sample data from (\w+)|sample (\w+)|show sample (\w+)|give me sample (\w+)/i;
  const sampleMatch = cleanedText.match(sampleDataPattern);
  if (sampleMatch) {
    const tableName = sampleMatch[1] || sampleMatch[2] || sampleMatch[3] || sampleMatch[4];
    if (tableName) {
      console.log(`Getting sample data from table: ${tableName}`);
      return `SELECT * FROM ${tableName} LIMIT 5`;
    }
  }
  
  // Handle help command
  if (/^help$|^sql help|how to use/i.test(cleanedText)) {
    return "HELP_COMMAND";
  }
  
  // If no patterns match, return the original text (assuming it's SQL)
  return text;
}

// Execute SQL query
router.post('/execute', isAuthenticated, async (req, res) => {
  try {
    const { query: originalQuery } = req.body;
    
    // Parse natural language to SQL if needed
    const parsedQuery = parseNaturalLanguageQuery(originalQuery);
    const query = parsedQuery;

    console.log('Original input:', originalQuery);
    console.log('Executing SQL query:', query);
    
    // If parsing changed the query, log this
    if (parsedQuery !== originalQuery) {
      console.log('Parsed natural language query to SQL');
    }
    
    // Handle special case for describe table
    if (query.startsWith("DESCRIBE_TABLE:")) {
      const tableName = query.substring("DESCRIBE_TABLE:".length);
      console.log(`Executing describe table for ${tableName}`);
      
      // First check if the table exists
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ) as exists
      `;
      
      const tableExistsResult = await pool.query(tableExistsQuery);
      const tableExists = tableExistsResult.rows[0].exists;
      
      if (!tableExists) {
        return res.json({
          data: `**Error:** Table \`${tableName}\` does not exist.\n\nUse "show all tables" to see available tables.`,
          error: `Table ${tableName} does not exist`,
          columns: ['error']
        });
      }
      
      // Execute the describe query
      const describeQuery = `
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `;
      
      const result = await pool.query(describeQuery);
      
      // Format the result as a markdown table
      const columns = result.fields.map(field => field.name);
      
      // Create markdown table
      let markdownTable = `## Table Structure: \`${tableName}\`\n\n`;
      markdownTable += '| ' + columns.join(' | ') + ' |\n';
      markdownTable += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
      
      // Add rows
      if (result.rows && result.rows.length > 0) {
        result.rows.forEach(row => {
          const rowValues = columns.map(col => {
            const value = row[col];
            return value === null ? 'NULL' : String(value);
          });
          markdownTable += '| ' + rowValues.join(' | ') + ' |\n';
        });
      } else {
        markdownTable += '| No columns found |\n';
      }
      
      // Add a note about viewing data
      markdownTable += `\n*To view the data in this table, use: \`show ${tableName} table\`*`;
      
      return res.json({
        data: markdownTable,
        columns: columns,
        isDescribe: true,
        tableName: tableName
      });
    }
    
    // Handle special case for help command
    if (query === "HELP_COMMAND") {
      const helpText = `
## Chat2SQL Help

### Commands

You can use natural language or SQL:

**View Data:**
- "fetch all data from users table"
- "fetch all the from users table"  
- "show sessions table"
- "SELECT * FROM documents LIMIT 10;"
- "sample data from users"
- "show sample messages"

**Limit Results:**
- "show 5 rows from users"
- "get 10 records from messages"
- "show top 3 from chat_sessions"

**Filter Data:**
- "show users where id = 1"
- "show messages where created_at > 2023-01-01"
- "show documents where title = important document"

**List Tables:**
- "show all tables"
- "list tables"
- "what tables exist"
- "how many tables"

**Count Records:**
- "count rows in users"
- "how many records in chat_sessions"
- "SELECT COUNT(*) FROM messages;"

**Describe Tables:**
- "describe users table"
- "what columns are in documents"
- "show structure of chat_sessions"

**SQL Examples:**
\`\`\`sql
-- Show specific columns
SELECT id, username FROM users;

-- Filter data
SELECT * FROM messages WHERE created_at > '2023-01-01';

-- Join tables
SELECT m.content, u.username 
FROM messages m
JOIN users u ON m.user_id = u.id;

-- Sort data
SELECT * FROM documents ORDER BY created_at DESC LIMIT 5;
\`\`\`

If a table is empty, you'll see a message indicating there are no records.
If a table doesn't exist, you'll get an error with a suggestion to check available tables.
`;

      return res.json({
        data: helpText,
        columns: ['help'],
        isHelp: true
      });
    }

    // Validate query - only allow SELECT statements for security
    if (!query.trim().toLowerCase().startsWith('select')) {
      return res.status(403).json({ 
        error: 'Only SELECT queries are allowed for security reasons' 
      });
    }
    
    // Check if we're trying to query a specific table and if it exists
    let tableToCheck = null;
    const tableMatch = query.match(/SELECT .* FROM (\w+)/i);
    
    // Skip the check for information_schema queries
    if (tableMatch && tableMatch[1] && 
        !query.toLowerCase().includes('information_schema') &&
        tableMatch[1] !== 'information_schema') {
      
      tableToCheck = tableMatch[1];
      console.log(`Checking if table exists: ${tableToCheck}`);
      
      // Check if table exists
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableToCheck}'
        ) as exists
      `;
      
      const tableExistsResult = await pool.query(tableExistsQuery);
      const tableExists = tableExistsResult.rows[0].exists;
      
      if (!tableExists) {
        return res.json({
          data: `**Error:** Table \`${tableToCheck}\` does not exist.\n\nUse "show all tables" to see available tables.`,
          error: `Table ${tableToCheck} does not exist`,
          columns: ['error']
        });
      }
    }
    
    // Add special handling for sessions table to see more details
    if (query.toLowerCase().includes('from sessions')) {
      console.log('Special handling for sessions table query');
      
      // First get column info
      const columnsQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'sessions'
        ORDER BY ordinal_position
      `;
      
      const columnsResult = await pool.query(columnsQuery);
      console.log('Sessions table columns:', JSON.stringify(columnsResult.rows));
    }
    
    // Execute the query
    console.log(`Executing query: ${query}`);
    const result = await pool.query(query);
    console.log(`Query returned ${result.rowCount || 0} rows`);
    
    if (result.rowCount > 0) {
      console.log('First row keys:', Object.keys(result.rows[0]));
    }
    
    // Format the result as a markdown table
    const columns = result.fields.map(field => field.name);
    
    // Create markdown table
    let markdownTable = '| ' + columns.join(' | ') + ' |\n';
    markdownTable += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
    
    // Add rows
    if (result.rows && result.rows.length > 0) {
      // Log the raw data to help with debugging
      console.log('Query result raw data (first row):', JSON.stringify(result.rows[0]));
      
      result.rows.forEach(row => {
        const rowValues = columns.map(col => {
          const value = row[col];
          
          // Handle different data types appropriately
          if (value === null) {
            return 'NULL';
          } else if (typeof value === 'object') {
            // Handle dates, JSON objects, etc.
            if (value instanceof Date) {
              return value.toISOString();
            } else {
              try {
                return JSON.stringify(value);
              } catch (e) {
                return String(value);
              }
            }
          } else {
            // Convert any non-object value to string
            return String(value);
          }
        });
        
        markdownTable += '| ' + rowValues.join(' | ') + ' |\n';
      });
    } else {
      // If there are no rows, add a message to the table
      markdownTable += `| ${columns.map(() => '').join(' | ')} |\n`;
      markdownTable += `| ${columns.map((col, i) => i === 0 ? '**Table is empty - no records found**' : '').join(' | ')} |\n`;
    }
    
    // Add query and row count information
    markdownTable += `\n\n*Executed query: \`${query}\`*`;
    markdownTable += `\n*Query returned ${result.rowCount || 0} rows.*`;
    
    // If query was translated from natural language, add explanation
    if (originalQuery !== query) {
      markdownTable = `*Translated your request to SQL: \`${query}\`*\n\n` + markdownTable;
    }
    
    res.json({
      data: markdownTable,
      columns: columns,
      rowCount: result.rowCount || 0,
      executedQuery: query
    });
  } catch (error) {
    console.error('Error executing SQL query:', error);
    res.status(500).json({ error: 'Error executing SQL query: ' + error.message });
  }
});

module.exports = router;