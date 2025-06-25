// Test script for dynamic table parsing - works with any table names
const predictorService = {
  // Parse table names from user command - completely dynamic
  parseTableNamesFromCommand: function(command) {
    const parts = command.trim().split(/\s+/).filter(part => part.length > 0);
    
    if (parts.length < 2) {
      return null;
    }
    
    const commandType = parts[0].toLowerCase();
    
    // Handle train command: train <table1> <table2> <table3>
    if (commandType === 'train' && parts.length >= 4) {
      return {
        place: parts[1],
        cts: parts[2],
        route: parts[3]
      };
    }
    
    // Handle predict command with multiple tables: predict <table1> <table2> [<table3>...]
    if (commandType === 'predict' && parts.length >= 3) {
      return {
        place: parts[1],
        cts: parts[2]
      };
    }
    
    // Handle single table prediction: predict <table>
    if (commandType === 'predict' && parts.length === 2) {
      const tableName = parts[1];
      // Try to determine table type based on name patterns
      const tableType = this.detectTableType(tableName);
      
      if (tableType === 'route') {
        return {
          route: tableName,
        };
      } else if (tableType === 'place') {
        return {
          place: tableName,
        };
      } else if (tableType === 'cts') {
        return {
          cts: tableName,
        };
      } else {
        // Unknown table type - let the system try to derive relationships
        return {
          route: tableName, // Default assumption for single table
        };
      }
    }
    
    return null;
  },

  // Detect table type based on naming patterns - completely dynamic
  detectTableType: function(tableName) {
    const name = tableName.toLowerCase();
    
    // Check for place table patterns
    if (name.includes('place') || name.includes('location') || name.includes('station')) {
      return 'place';
    }
    
    // Check for CTS table patterns
    if (name.includes('cts') || name.includes('schedule') || name.includes('time')) {
      return 'cts';
    }
    
    // Check for route table patterns
    if (name.includes('route') || name.includes('path') || name.includes('journey')) {
      return 'route';
    }
    
    return 'unknown';
  },

  // Extract base pattern from table name - works with any naming convention
  extractBasePattern: function(tableName) {
    let pattern = tableName.toLowerCase();
    
    // Remove common table type indicators
    pattern = pattern
      .replace(/place|location|station/gi, '')
      .replace(/cts|schedule|time/gi, '')
      .replace(/route|path|journey/gi, '')
      .replace(/\.csv$/gi, '')
      .replace(/_csv$/gi, '')
      .replace(/^(reg|ariane|test|dev|prod)_/gi, '$1')
      .replace(/_(reg|ariane|test|dev|prod)$/gi, '$1')
      .replace(/[_\-\.]+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    return pattern;
  }
};

// Test cases with various naming patterns
console.log('=== Testing Dynamic Table Parsing ===\n');

// Test 1: Standard format
console.log('1. Standard format:');
console.log('Command: predict reg_place_csv reg_cts_csv');
console.log('Result:', predictorService.parseTableNamesFromCommand('predict reg_place_csv reg_cts_csv'));
console.log();

// Test 2: Different naming patterns
console.log('2. Different naming patterns:');
console.log('Command: predict company_location_data company_schedule_data');
console.log('Result:', predictorService.parseTableNamesFromCommand('predict company_location_data company_schedule_data'));
console.log();

// Test 3: Single table - route
console.log('3. Single route table:');
console.log('Command: predict my_route_table');
console.log('Result:', predictorService.parseTableNamesFromCommand('predict my_route_table'));
console.log('Table type:', predictorService.detectTableType('my_route_table'));
console.log();

// Test 4: Single table - place
console.log('4. Single place table:');
console.log('Command: predict station_locations');
console.log('Result:', predictorService.parseTableNamesFromCommand('predict station_locations'));
console.log('Table type:', predictorService.detectTableType('station_locations'));
console.log();

// Test 5: Single table - cts
console.log('5. Single CTS table:');
console.log('Command: predict time_schedule_data');
console.log('Result:', predictorService.parseTableNamesFromCommand('predict time_schedule_data'));
console.log('Table type:', predictorService.detectTableType('time_schedule_data'));
console.log();

// Test 6: Training command
console.log('6. Training command:');
console.log('Command: train my_places my_times my_routes');
console.log('Result:', predictorService.parseTableNamesFromCommand('train my_places my_times my_routes'));
console.log();

// Test 7: Pattern extraction
console.log('7. Pattern extraction:');
const testTables = [
  'reg_place_csv',
  'reg_cts_csv', 
  'reg_route_csv',
  'company_location_data',
  'company_schedule_data',
  'company_path_data'
];

testTables.forEach(table => {
  console.log(`Table: ${table} -> Pattern: ${predictorService.extractBasePattern(table)} -> Type: ${predictorService.detectTableType(table)}`);
});

console.log('\n=== Dynamic Parsing Complete ===');