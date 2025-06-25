import { api } from './api';

export interface TableInfo {
  table_name: string;
  row_count: number;
  has_endpoint: boolean;
  has_slack: boolean;
  has_required_features: boolean;
  missing_features: string[];
  suitable_for_training: boolean;
  all_columns: string[];
}

export interface TrainingSet {
  group_name: string;
  place_table: string;
  cts_table: string;
  route_table: string;
  total_rows: {
    place: number;
    cts: number;
    route: number;
  };
}

export interface AvailableTablesResponse {
  status: string;
  total_tables: number;
  suitable_for_training: number;
  all_tables: TableInfo[];
  detected_table_groups: Record<string, any>;
  complete_training_sets: TrainingSet[];
  required_columns: {
    mandatory: string[];
    features: string[];
  };
  message: string;
  example_usage: Record<string, any>;
  instructions: {
    training: string;
    adding_new_tables: string;
    feature_columns_required: string[];
  };
}

export interface TrainRequest {
  place_table: string;
  cts_table: string;
  route_table: string;
}

export interface PredictRequest {
  place_table?: string;
  cts_table?: string;
}

// Helper functions for table processing
const detectTableType = (tableName: string): 'place' | 'cts' | 'route' | 'unknown' => {
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
};

// Extract base pattern from table name - works with any naming convention
const extractBasePattern = (tableName: string): string => {
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
};

// Check if two patterns match - flexible matching
const patternsMatch = (pattern1: string, pattern2: string): boolean => {
  if (!pattern1 || !pattern2) return false;
  
  // Exact match
  if (pattern1 === pattern2) return true;
  
  // One contains the other
  if (pattern1.includes(pattern2) || pattern2.includes(pattern1)) return true;
  
  // Similar patterns (at least 70% similarity)
  const similarity = calculateSimilarity(pattern1, pattern2);
  return similarity >= 0.7;
};

// Calculate similarity between two strings
const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

// Calculate Levenshtein distance
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

// Find related tables using intelligent pattern matching - completely dynamic
const findRelatedTablesByPattern = (inputTable: string, availableTables: AvailableTablesResponse): { place?: string; cts?: string; route?: string } => {
  const inputName = inputTable.toLowerCase();
  
  // Extract base pattern from input table name
  const basePattern = extractBasePattern(inputName);
  const inputTableType = detectTableType(inputTable);
  
  let placeTable, ctsTable, routeTable;
  
  // Find tables with similar base patterns
  for (const table of availableTables.all_tables) {
    const tableName = table.table_name.toLowerCase();
    const tableBasePattern = extractBasePattern(tableName);
    const tableType = detectTableType(table.table_name);
    
    // Check if tables share the same base pattern
    if (patternsMatch(basePattern, tableBasePattern)) {
      if (tableType === 'place' && !placeTable) {
        placeTable = table.table_name;
      } else if (tableType === 'cts' && !ctsTable) {
        ctsTable = table.table_name;
      } else if (tableType === 'route' && !routeTable) {
        routeTable = table.table_name;
      }
    }
  }
  
  // If input table is one of the types, include it in the result
  if (inputTableType === 'place') placeTable = inputTable;
  else if (inputTableType === 'cts') ctsTable = inputTable;
  else if (inputTableType === 'route') routeTable = inputTable;
  
  return {
    place: placeTable,
    cts: ctsTable,
    route: routeTable
  };
};

export const predictorService = {
  // Get all available tables from the database
  getAvailableTables: async (): Promise<AvailableTablesResponse> => {
    try {
      const response = await fetch('http://127.0.0.1:8088/get-available-tables');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching available tables:', error);
      throw error;
    }
  },

  // Train model with specified tables
  trainModel: async (request: TrainRequest): Promise<any> => {
    try {
      const response = await fetch('http://127.0.0.1:8088/slack-prediction/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Training failed: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error training model:', error);
      throw error;
    }
  },

  // Make predictions with specified tables
  predict: async (request: PredictRequest): Promise<any> => {
    try {
      // Add debugging to see what's being sent to the backend
      console.log('📊 Making prediction request with tables:', {
        place_table: request.place_table,
        cts_table: request.cts_table
      });
      
      // Validate request - if tables exist but either one is undefined, log warning
      if ((request.place_table && !request.cts_table) || (!request.place_table && request.cts_table)) {
        console.warn('⚠️ Making prediction with only one table specified:', request);
      }
      
      const response = await fetch('http://127.0.0.1:8088/slack-prediction/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Prediction failed: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Log received prediction data
      console.log('📊 Received prediction response:', {
        status: result.status,
        metrics: result.metrics,
        predictions_count: result.data?.length || 0
      });
      
      return result;
    } catch (error) {
      console.error('Error making prediction:', error);
      throw error;
    }
  },

  // Parse table names from user command - completely dynamic
  parseTableNamesFromCommand: (command: string): { place?: string; cts?: string; route?: string } | null => {
    const parts = command.trim().split(/\s+/).filter(part => part.length > 0);
    
    console.log('🔍 PARSING DEBUG:', {
      originalCommand: command,
      parts: parts,
      partsLength: parts.length
    });
    
    if (parts.length < 2) {
      console.log('❌ Command too short');
      return null;
    }
    
    const commandType = parts[0].toLowerCase();
    
    // Handle train command: train <table1> <table2> <table3>
    if (commandType === 'train' && parts.length >= 4) {
      console.log('✅ Matched TRAIN command');
      return {
        place: parts[1],
        cts: parts[2],
        route: parts[3]
      };
    }
    
    // Handle predict command with multiple tables: predict <table1> <table2> [<table3>...]
    if (commandType === 'predict' && parts.length >= 3) {
      // Detect table types instead of assuming positions
      const table1 = parts[1];
      const table2 = parts[2];
      
      const type1 = detectTableType(table1);
      const type2 = detectTableType(table2);
      
      console.log('✅ Matched PREDICT with two tables:', {
        table1: { name: table1, detectedType: type1 },
        table2: { name: table2, detectedType: type2 }
      });
      
      // Create result object based on detected types
      const result: { place?: string; cts?: string } = {};
      
      // If we can clearly identify the table types
      if (type1 === 'place' && type2 === 'cts') {
        result.place = table1;
        result.cts = table2;
      } else if (type1 === 'cts' && type2 === 'place') {
        result.place = table2;
        result.cts = table1;
      } else {
        // If type detection is uncertain, use name heuristics as backup
        if (table1.toLowerCase().includes('place') || table2.toLowerCase().includes('cts')) {
          result.place = table1;
          result.cts = table2;
        } else if (table1.toLowerCase().includes('cts') || table2.toLowerCase().includes('place')) {
          result.place = table2;
          result.cts = table1;
        } else {
          // Last resort: use position-based assignment as before
          result.place = table1;
          result.cts = table2;
        }
      }
      
      console.log('✅ Returned result after type detection:', result);
      return result;
    }
    
    // Handle single table prediction: predict <table>
    if (commandType === 'predict' && parts.length === 2) {
      const tableName = parts[1];
      // Try to determine table type based on name patterns
      const tableType = detectTableType(tableName);
      
      console.log('✅ Matched SINGLE table predict:', {
        tableName: tableName,
        detectedType: tableType
      });
      
      // Always return both table types regardless of what's provided
      // This ensures consistent behavior with complementary tables
      if (tableType === 'place') {
        // For place table, also set a standard cts table
        return {
          place: tableName,
          cts: 'reg_cts_csv' // Use a standard complementary table
        };
      } else if (tableType === 'cts') {
        // For cts table, also set a standard place table
        return {
          cts: tableName,
          place: 'reg_place_csv' // Use a standard complementary table
        };
      } else if (tableType === 'route') {
        return {
          route: tableName,
        };
      } else {
        // For unknown types, return the table as is and let the system
        // try to derive relationships downstream
        return {
          place: tableName, // Try as place first
        };
      }
    }
    
    console.log('❌ No parsing match found');
    return null;
  },

  // Detect table type based on naming patterns - completely dynamic
  detectTableType: detectTableType,

  // Derive related table names dynamically - works with any table naming patterns
  deriveTableNames: (inputTable: string, availableTables?: AvailableTablesResponse): { place?: string; cts?: string; route?: string } => {
    if (!availableTables) {
      return {};
    }

    // First, try to find exact matches in training sets
    const matchingSet = availableTables.complete_training_sets.find(set => 
      set.route_table === inputTable || set.place_table === inputTable || set.cts_table === inputTable
    );

    if (matchingSet) {
      return {
        place: matchingSet.place_table,
        cts: matchingSet.cts_table,
        route: matchingSet.route_table
      };
    }

    // If no exact match, try intelligent pattern matching
    return findRelatedTablesByPattern(inputTable, availableTables);
  },

  // Find related tables using intelligent pattern matching - completely dynamic
  findRelatedTablesByPattern: findRelatedTablesByPattern,

  // Helper function references
  extractBasePattern: extractBasePattern,
  patternsMatch: patternsMatch,
  calculateSimilarity: calculateSimilarity,
  levenshteinDistance: levenshteinDistance,

  // Store last training session info
  setLastTrainingSession: (place: string, cts: string, route: string) => {
    try {
      const sessionInfo = { place, cts, route, timestamp: Date.now() };
      localStorage.setItem('predictor_last_training', JSON.stringify(sessionInfo));
    } catch (error) {
      console.error('Error storing training session info:', error);
    }
  },

  // Get last training session info
  getLastTrainingSession: (): { place?: string; cts?: string; route?: string } | null => {
    try {
      const stored = localStorage.getItem('predictor_last_training');
      if (stored) {
        const sessionInfo = JSON.parse(stored);
        // Check if it's not too old (24 hours)
        if (Date.now() - sessionInfo.timestamp < 24 * 60 * 60 * 1000) {
          return sessionInfo;
        }
      }
    } catch (error) {
      console.error('Error retrieving training session info:', error);
    }
    return null;
  },

  // Find suitable training sets based on partial table names or patterns
  findTrainingSets: (availableTables: AvailableTablesResponse, pattern?: string): TrainingSet[] => {
    if (!pattern) {
      return availableTables.complete_training_sets;
    }
    
    const lowerPattern = pattern.toLowerCase();
    return availableTables.complete_training_sets.filter(set => 
      set.group_name.toLowerCase().includes(lowerPattern) ||
      set.place_table.toLowerCase().includes(lowerPattern) ||
      set.cts_table.toLowerCase().includes(lowerPattern) ||
      set.route_table.toLowerCase().includes(lowerPattern)
    );
  },

  // Validate if tables exist and are suitable for training
  validateTables: (availableTables: AvailableTablesResponse, place: string, cts: string, route: string): {
    valid: boolean;
    errors: string[];
    suggestions?: TrainingSet[];
  } => {
    const errors: string[] = [];
    const allTables = availableTables.all_tables;
    
    const placeTable = allTables.find(t => t.table_name === place);
    const ctsTable = allTables.find(t => t.table_name === cts);
    const routeTable = allTables.find(t => t.table_name === route);
    
    if (!placeTable) {
      errors.push(`Place table '${place}' not found in database`);
    } else if (!placeTable.suitable_for_training) {
      errors.push(`Place table '${place}' is missing required columns: ${placeTable.missing_features.join(', ')}`);
    }
    
    if (!ctsTable) {
      errors.push(`CTS table '${cts}' not found in database`);
    } else if (!ctsTable.suitable_for_training) {
      errors.push(`CTS table '${cts}' is missing required columns: ${ctsTable.missing_features.join(', ')}`);
    }
    
    if (!routeTable) {
      errors.push(`Route table '${route}' not found in database`);
    } else if (!routeTable.suitable_for_training) {
      errors.push(`Route table '${route}' is missing required columns: ${routeTable.missing_features.join(', ')}`);
    }
    
    const suggestions = errors.length > 0 ? availableTables.complete_training_sets : undefined;
    
    return {
      valid: errors.length === 0,
      errors,
      suggestions
    };
  }
};

export default predictorService;