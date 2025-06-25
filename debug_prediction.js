// Debug script to test the prediction parsing logic
function parseTableNamesFromCommand(command) {
    const parts = command.trim().split(/\s+/).filter(part => part.length > 0);
    
    console.log('Command:', command);
    console.log('Parts:', parts);
    console.log('Parts length:', parts.length);
    
    // Handle train command: train <place> <cts> <route>
    if (parts.length >= 4 && parts[0].toLowerCase() === 'train') {
      return {
        place: parts[1],
        cts: parts[2],
        route: parts[3]
      };
    }
    
    // Handle predict command with both tables: predict <place> <cts>
    if (parts.length >= 3 && parts[0].toLowerCase() === 'predict') {
      console.log('Matched predict with place and cts');
      return {
        place: parts[1],
        cts: parts[2]
      };
    }
    
    // Handle single table prediction (e.g., "predict reg_route_csv")
    // This should only be used when user provides exactly one table after predict
    if (parts.length === 2 && parts[0].toLowerCase() === 'predict') {
      const tableName = parts[1];
      // Check if this looks like a route table (contains 'route' in name)
      if (tableName.toLowerCase().includes('route')) {
        console.log('Matched single route table prediction');
        return {
          route: tableName,
        };
      } else {
        // If it doesn't look like a route table, treat it as an error case
        console.log('Single table does not look like route table, returning null');
        return null;
      }
    }
    
    return null;
}

// Test cases
console.log('=== Testing predict reg_place_csv reg_cts_csv ===');
const result1 = parseTableNamesFromCommand('predict reg_place_csv reg_cts_csv');
console.log('Result:', result1);

console.log('\n=== Testing predict reg_place_csv ===');
const result2 = parseTableNamesFromCommand('predict reg_place_csv');
console.log('Result:', result2);

console.log('\n=== Testing train reg_place_csv reg_cts_csv reg_route_csv ===');
const result3 = parseTableNamesFromCommand('train reg_place_csv reg_cts_csv reg_route_csv');
console.log('Result:', result3);