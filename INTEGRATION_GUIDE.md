# QOR Prediction Integration Guide

This guide explains how to integrate the `DynamicQueryHandler` with your prediction.py file to ensure consistent results regardless of query order or format.

## Key Files

1. **dynamic_query_handler.py**: The main class that handles natural language queries and ensures consistent SQL generation
2. **prediction_integration.py**: Example showing how to integrate with your prediction workflow

## Integration Steps

### 1. Add Dynamic Query Handler to Your Project

Copy the `dynamic_query_handler.py` file to your project directory. This class:
- Dynamically discovers your database schema
- Maps natural language terms to database columns
- Ensures consistent SQL generation regardless of query wording
- Avoids hardcoded values by learning from your actual database structure

### 2. Initialize the Query Handler

In your prediction.py file, initialize the handler once at startup:

```python
from dynamic_query_handler import DynamicQueryHandler

# Database Configuration
DB_CONFIG = {
    'host': '172.16.16.54',
    'database': 'qor',
    'user': 'postgres',
    'password': 'root',
    'port': '5432'
}

# Initialize once at startup
query_handler = DynamicQueryHandler(DB_CONFIG)
```

### 3. Process Natural Language Queries

When a user submits a natural language query, use the handler to process it:

```python
def handle_user_query(user_query):
    # Convert natural language to SQL
    sql_query = query_handler.process_query(user_query)
    
    # Execute the query
    result_df = query_handler.execute_query(sql_query)
    
    # Now pass the consistent result to your prediction model
    predictions = your_prediction_model(result_df)
    
    return predictions
```

### 4. Integration with Web API

In your FastAPI endpoint:

```python
@app.post("/chat2sql/execute")
async def execute_query_endpoint(request: Request):
    body = await request.json()
    query = body.get('query')
    
    # Process with consistent query handling
    sql_query = query_handler.process_query(query)
    result_df = query_handler.execute_query(sql_query)
    
    # Run prediction if needed
    if "predict" in query.lower():
        predictions = your_prediction_model(result_df)
        # Include predictions in response
    
    # Format and return response
    # ...
```

## Key Benefits

1. **Consistency**: The same metrics will return the same values regardless of query phrasing
2. **Adaptability**: No hardcoded values - dynamically adapts to your database schema
3. **Prediction Accuracy**: Your prediction models will work with consistent data inputs
4. **Maintainability**: When you add new metrics or tables, the system automatically adapts

## Example Queries That Will Return Consistent Results

All these queries will generate consistent SQL for the same metrics:

- "show place and cts slack values"
- "show cts and place slack values"
- "get place slack"
- "get cts slack" 
- "predict place and cts slack"
- "predict cts and place slack"
- "route slack prediction results"

## Testing the Integration

Run the prediction_integration.py file to see how the system maintains consistency:

```bash
python prediction_integration.py
```