#!/usr/bin/env python3
"""
Integration example showing how to use the DynamicQueryHandler with prediction.py
This is a template - you should integrate these functions into your actual prediction.py file.
"""

import logging
from dynamic_query_handler import DynamicQueryHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database Configuration
DB_CONFIG = {
    'host': '172.16.16.54',
    'database': 'qor',
    'user': 'postgres',
    'password': 'root',
    'port': '5432'
}

# Initialize the dynamic query handler (do this once, at startup)
query_handler = DynamicQueryHandler(DB_CONFIG)

def process_user_query(user_query):
    """
    Process a user's natural language query about QOR metrics
    
    Args:
        user_query: The natural language query from the user
        
    Returns:
        DataFrame with query results
    """
    # Convert natural language to SQL using our dynamic handler
    sql_query = query_handler.process_query(user_query)
    
    try:
        # Execute the query
        result_df = query_handler.execute_query(sql_query)
        
        # Log query results summary
        if not result_df.empty:
            logger.info(f"Query returned {len(result_df)} rows with columns: {list(result_df.columns)}")
        else:
            logger.warning("Query returned no results")
        
        return result_df
    
    except Exception as e:
        logger.error(f"Error executing query: {str(e)}")
        # Return empty DataFrame or handle error as needed
        return None

def prediction_workflow(user_query):
    """
    Example workflow integrating query handling with prediction
    
    Args:
        user_query: User's natural language query
        
    Returns:
        Tuple of (data_df, prediction_results)
    """
    # Step 1: Process the query to get consistent data
    data_df = process_user_query(user_query)
    
    if data_df is None or data_df.empty:
        logger.warning("No data available for prediction")
        return None, None
    
    # Step 2: Your existing prediction logic would go here
    # This is a placeholder - replace with your actual prediction code
    prediction_results = {
        "prediction_type": query_handler.get_query_type(user_query),
        "metrics_analyzed": query_handler.extract_metrics(user_query),
        # Your prediction model would process data_df here
        "results": "Prediction results would be generated based on the consistent data"
    }
    
    return data_df, prediction_results

# Example usage
if __name__ == "__main__":
    # Test with various query formats to verify consistency
    test_queries = [
        "show place and cts slack values",
        "show cts and place slack values",
        "get place slack",
        "get cts slack",
        "predict place and cts slack",
        "predict cts and place slack",
        "route slack prediction results"
    ]
    
    print("\nTESTING DYNAMIC QUERY HANDLER\n")
    print("-" * 80)
    
    for query in test_queries:
        print(f"\nTesting query: '{query}'")
        sql = query_handler.process_query(query)
        print(f"Generated SQL: {sql}")
        
        # For brevity, we're not executing the queries here
        # In a real scenario, you would use:
        # result_df = process_user_query(query)
        
        print("-" * 80)
    
    print("\nINTEGRATION INSTRUCTIONS:")
    print("""
1. Copy the DynamicQueryHandler class into your project
2. Initialize it once at startup with your database configuration
3. Use the process_query() method to convert natural language to SQL
4. Use the execute_query() method to run the SQL and get results
5. Your prediction models will now always receive consistent data regardless of query phrasing
""")