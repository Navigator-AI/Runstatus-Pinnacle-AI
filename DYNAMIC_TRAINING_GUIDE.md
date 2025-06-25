# Dynamic Training and Prediction System

## Overview

The training and prediction system is **completely dynamic** and will automatically work with any new tables added to the `algodb` database. There are **no hardcoded table names** or restrictions.

## How It Works

### 1. **Dynamic Table Discovery**
- The system automatically scans the database for available tables
- Checks which tables have the required columns for training
- Groups tables by naming patterns to detect complete training sets
- **Endpoint:** `GET /available-tables`

### 2. **Automatic Validation**
- Validates that tables exist in the database
- Checks for required columns before training
- Ensures common endpoints exist between all 3 tables
- Provides clear error messages for missing requirements

### 3. **Generic Training Process**
- Works with any table names provided by the user
- Requires exactly 3 tables: place, cts, and route
- Automatically adapts to different data sizes and patterns
- No code changes needed for new tables

## Requirements for New Tables

### Required Columns
Every table must contain these columns:

**Mandatory Columns:**
- `endpoint` - For matching records between tables
- `slack` - Target variable for prediction

**Feature Columns:**
- `fanout` - Fan-out count
- `netcount` - Net count
- `netdelay` - Net delay
- `invdelay` - Inverter delay
- `bufdelay` - Buffer delay
- `seqdelay` - Sequential delay
- `skew` - Clock skew
- `combodelay` - Combinational delay
- `wirelength` - Wire length

### Recommended Naming Convention
For automatic detection of complete training sets:
- `<prefix>_place_<suffix>` - Place data
- `<prefix>_cts_<suffix>` - CTS data  
- `<prefix>_route_<suffix>` - Route data

**Examples:**
- `ariane_place_sorted_csv`, `ariane_cts_sorted_csv`, `ariane_route_sorted_csv`
- `reg_place_csv`, `reg_cts_csv`, `reg_route_csv`
- `new_design_place_data`, `new_design_cts_data`, `new_design_route_data`

## API Usage

### 1. Discover Available Tables
```bash
GET /available-tables
```

**Response:**
```json
{
  "status": "success",
  "total_tables": 6,
  "suitable_for_training": 6,
  "complete_training_sets": [
    {
      "group_name": "ariane",
      "place_table": "ariane_place_sorted_csv",
      "cts_table": "ariane_cts_sorted_csv", 
      "route_table": "ariane_route_sorted_csv",
      "total_rows": {"place": 3969, "cts": 3969, "route": 3969}
    }
  ],
  "example_usage": {...}
}
```

### 2. Train with Any Tables
```bash
POST /slack-prediction/train
Content-Type: application/json

{
  "place_table": "your_place_table_name",
  "cts_table": "your_cts_table_name", 
  "route_table": "your_route_table_name"
}
```

### 3. Predict with Any Tables
```bash
POST /predict
Content-Type: application/json

{
  "place_table": "your_place_table_name",
  "cts_table": "your_cts_table_name"
}
```

## Adding New Tables

### Method 1: Direct Database Insert
```sql
-- Create your table with required columns
CREATE TABLE my_new_place_data (
    endpoint TEXT,
    slack FLOAT,
    fanout INTEGER,
    netcount INTEGER,
    netdelay FLOAT,
    invdelay FLOAT,
    bufdelay FLOAT,
    seqdelay FLOAT,
    skew FLOAT,
    combodelay FLOAT,
    wirelength FLOAT,
    -- ... other columns
);

-- Insert your data
INSERT INTO my_new_place_data VALUES (...);
```

### Method 2: Using Python/Pandas
```python
import pandas as pd
from sqlalchemy import create_engine

# Create your DataFrame with required columns
df = pd.DataFrame({
    'endpoint': [...],
    'slack': [...],
    'fanout': [...],
    # ... all required columns
})

# Upload to database
engine = create_engine("postgresql://user:pass@host:port/algodb")
df.to_sql('my_new_table', engine, if_exists='replace', index=False)
```

### Method 3: CSV Import
```bash
# Use any PostgreSQL CSV import method
COPY my_new_table FROM '/path/to/your/file.csv' DELIMITER ',' CSV HEADER;
```

## Testing New Tables

Use the provided test script:
```bash
python test_training.py
```

Or test manually:
```bash
# 1. Check if tables are detected
curl http://localhost:8000/available-tables

# 2. Train with your tables
curl -X POST http://localhost:8000/slack-prediction/train \
  -H "Content-Type: application/json" \
  -d '{"place_table":"your_place","cts_table":"your_cts","route_table":"your_route"}'

# 3. Predict with your tables  
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"place_table":"your_place","cts_table":"your_cts"}'
```

## Error Handling

The system provides clear error messages for common issues:

### Missing Tables
```json
{
  "status": "error",
  "message": "Table 'nonexistent_table' does not exist in the database"
}
```

### Missing Columns
```json
{
  "status": "error", 
  "message": "Table 'my_table' is missing required columns: ['slack', 'fanout']. Required columns are: [...]"
}
```

### Incomplete Training Set
```json
{
  "status": "error",
  "message": "All three tables are required for training. Missing: ['route_table']. Please provide place_table, cts_table, and route_table."
}
```

### No Common Endpoints
```json
{
  "status": "error",
  "message": "No common endpoints found between the three tables"
}
```

## Current Database Tables

Your `algodb` currently contains:

**Ariane Dataset (3,969 rows each):**
- `ariane_place_sorted_csv`
- `ariane_cts_sorted_csv`
- `ariane_route_sorted_csv`

**Reg Dataset (200 rows each):**
- `reg_place_csv`
- `reg_cts_csv`
- `reg_route_csv`

## Key Benefits

✅ **Fully Dynamic** - No hardcoded table names  
✅ **Automatic Detection** - New tables work immediately  
✅ **Flexible Naming** - Any naming convention works  
✅ **Comprehensive Validation** - Clear error messages  
✅ **Future-Proof** - No code changes needed for new data  
✅ **Scalable** - Works with any data size  

## Demo Script

Run the demo to see how new tables work automatically:
```bash
python demo_new_tables.py
```

This will:
1. Create sample tables with proper structure
2. Upload them to the database
3. Test training and prediction automatically
4. Show that no code changes were needed

---

**The system is completely dynamic and ready for any new tables you add to the database!**