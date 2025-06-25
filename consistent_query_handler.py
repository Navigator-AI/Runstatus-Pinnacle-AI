import re
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConsistentQueryHandler:
    """
    Ensures consistent SQL query generation regardless of the order of terms
    or whether metrics are requested individually or together
    """
    
    # Define standardized metric names and their variations
    METRIC_MAPPINGS = {
        'place': ['place', 'placement', 'place_slack', 'place_timing'],
        'cts': ['cts', 'clock_tree', 'clock_tree_synthesis', 'cts_slack'],
        'route': ['route', 'routing', 'route_slack', 'route_timing'],
        'setup': ['setup', 'setup_slack', 'setup_timing'],
        'hold': ['hold', 'hold_slack', 'hold_timing'],
        'wns': ['wns', 'worst_negative_slack', 'worst_slack'],
        'tns': ['tns', 'total_negative_slack'],
    }
    
    # Define standard column names for each metric
    METRIC_COLUMNS = {
        'place': ['design', 'stage', 'place_setup_WNS', 'place_setup_TNS', 'place_hold_WNS', 'place_hold_TNS'],
        'cts': ['design', 'stage', 'cts_setup_WNS', 'cts_setup_TNS', 'cts_hold_WNS', 'cts_hold_TNS'],
        'route': ['design', 'stage', 'route_setup_WNS', 'route_setup_TNS', 'route_hold_WNS', 'route_hold_TNS'],
    }
    
    # Main table to query for consistent results
    DEFAULT_TABLE = 'qor_metrics'  # Replace with your actual table name
    
    def __init__(self):
        # Build reverse mapping for quick lookup
        self.metric_reverse_map = {}
        for standard, variations in self.METRIC_MAPPINGS.items():
            for variation in variations:
                self.metric_reverse_map[variation.lower()] = standard
    
    def extract_metrics(self, query_text):
        """Extract standardized metric names from query text"""
        query_lower = query_text.lower()
        found_metrics = set()
        
        # Search for all possible metric variations
        for term in query_lower.split():
            # Clean term of any punctuation
            clean_term = re.sub(r'[^\w\s]', '', term)
            if clean_term in self.metric_reverse_map:
                found_metrics.add(self.metric_reverse_map[clean_term])
        
        logger.info(f"Extracted metrics from query: {found_metrics}")
        return list(found_metrics)
    
    def generate_consistent_sql(self, query_text):
        """Generate consistent SQL regardless of query text order"""
        metrics = self.extract_metrics(query_text)
        
        # If no recognized metrics, return a generic query
        if not metrics:
            return f"SELECT * FROM {self.DEFAULT_TABLE} LIMIT 50;"
        
        # Build a comprehensive query that includes all relevant columns
        columns = ['design', 'stage']  # Always include these
        
        # Add specific metric columns
        for metric in metrics:
            if metric in self.METRIC_COLUMNS:
                # Add all columns except design and stage (already included)
                metric_cols = [col for col in self.METRIC_COLUMNS[metric] if col not in columns]
                columns.extend(metric_cols)
        
        # If we're only selecting the default columns, just get everything
        if columns == ['design', 'stage']:
            return f"SELECT * FROM {self.DEFAULT_TABLE} LIMIT 50;"
        
        # Generate the SQL
        sql = f"SELECT {', '.join(columns)} FROM {self.DEFAULT_TABLE}"
        
        # Add limiting conditions if needed
        if 'place' in metrics and 'cts' in metrics and 'route' not in metrics:
            sql += " WHERE stage IN ('place', 'cts')"
        elif 'place' in metrics and 'route' in metrics and 'cts' not in metrics:
            sql += " WHERE stage IN ('place', 'route')"
        elif 'cts' in metrics and 'route' in metrics and 'place' not in metrics:
            sql += " WHERE stage IN ('cts', 'route')"
        elif 'place' in metrics and 'cts' not in metrics and 'route' not in metrics:
            sql += " WHERE stage = 'place'"
        elif 'cts' in metrics and 'place' not in metrics and 'route' not in metrics:
            sql += " WHERE stage = 'cts'"
        elif 'route' in metrics and 'place' not in metrics and 'cts' not in metrics:
            sql += " WHERE stage = 'route'"
        
        # Always add an order by clause to ensure consistent ordering
        sql += " ORDER BY design, stage LIMIT 100;"
        
        logger.info(f"Generated consistent SQL: {sql}")
        return sql
    
    def get_query_type(self, query_text):
        """Determine the type of query being made"""
        query_lower = query_text.lower()
        
        if re.search(r'predict|prediction|forecast|estimate', query_lower):
            return "prediction"
        elif re.search(r'compare|comparison|versus|vs', query_lower):
            return "comparison"
        elif re.search(r'trend|history|historical|over time', query_lower):
            return "trend"
        else:
            return "data_retrieval"

# Example usage
if __name__ == "__main__":
    handler = ConsistentQueryHandler()
    
    # Test different query variations
    queries = [
        "show me place and cts results",
        "show me cts and place results",
        "get place slack values",
        "get cts slack values",
        "show route slack prediction results"
    ]
    
    for q in queries:
        print(f"\nQuery: {q}")
        print(f"Metrics: {handler.extract_metrics(q)}")
        print(f"Query Type: {handler.get_query_type(q)}")
        print(f"SQL: {handler.generate_consistent_sql(q)}")