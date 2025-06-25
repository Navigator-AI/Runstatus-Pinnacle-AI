# Dynamic Prediction System - Features & Capabilities

## 🎯 Overview
The prediction system is now completely dynamic and works with **any table names** in your database. No hardcoded table names - it automatically adapts to your naming conventions.

## 🚀 Key Features

### 1. **Dynamic Table Detection**
- Automatically detects table types based on naming patterns
- Supports multiple naming conventions:
  - Place tables: `place`, `location`, `station`
  - CTS tables: `cts`, `schedule`, `time`
  - Route tables: `route`, `path`, `journey`

### 2. **Flexible Command Formats**
```bash
# Explicit format (recommended)
predict my_place_data my_cts_data

# Auto-detection from single table
predict my_route_table
predict station_locations
predict schedule_data

# Training with any table names
train company_places company_schedules company_routes
```

### 3. **Intelligent Pattern Matching**
- Extracts base patterns from table names
- Finds related tables automatically
- Uses similarity algorithms for fuzzy matching
- Works with various naming conventions:
  - `reg_place_csv`, `reg_cts_csv`, `reg_route_csv`
  - `company_location_data`, `company_schedule_data`, `company_path_data`
  - `my_places`, `my_times`, `my_routes`

### 4. **Smart Error Handling**
- Provides helpful suggestions when tables can't be found
- Shows available training sets dynamically
- Explains what the system tried to do
- Gives clear examples for any naming pattern

## 🔧 How It Works

### Table Type Detection
```javascript
// Examples of automatic detection:
"station_locations" → place table
"time_schedule_data" → cts table  
"my_route_table" → route table
"company_path_info" → route table
```

### Pattern Extraction
```javascript
// Base pattern extraction:
"reg_place_csv" → "reg"
"company_location_data" → "company_data"
"my_station_info" → "my_info"
```

### Related Table Finding
1. **Exact Match**: Looks for tables in existing training sets
2. **Pattern Match**: Finds tables with similar base patterns
3. **Fuzzy Match**: Uses similarity algorithms (70% threshold)
4. **Fallback**: Uses last training session data

## 📊 Supported Scenarios

### Training
- `train table1 table2 table3` - Any three tables
- System validates table suitability automatically
- Stores training relationships for future predictions

### Prediction
- `predict place_table cts_table` - Explicit specification
- `predict any_table` - Auto-detect related tables
- `predict` - Use last training session or first available set

## 🎨 Benefits

1. **Future-Proof**: Works with any new tables added to database
2. **Flexible**: Supports various naming conventions
3. **Intelligent**: Auto-detects relationships between tables
4. **User-Friendly**: Clear error messages and suggestions
5. **Robust**: Handles edge cases and provides fallbacks

## 🔮 Examples for Different Industries

### Transportation
```bash
train station_locations bus_schedules route_paths
predict station_locations bus_schedules
```

### Logistics
```bash
train warehouse_places delivery_times shipping_routes
predict warehouse_data
```

### Manufacturing
```bash
train facility_locations production_schedules process_routes
predict facility_locations production_schedules
```

## 🛠️ Technical Implementation

- **Dynamic parsing** with regex patterns
- **Levenshtein distance** for similarity matching
- **Pattern extraction** algorithms
- **Fallback mechanisms** for edge cases
- **Comprehensive error handling**

The system is now completely adaptable and will work with any table naming convention you use in the future!