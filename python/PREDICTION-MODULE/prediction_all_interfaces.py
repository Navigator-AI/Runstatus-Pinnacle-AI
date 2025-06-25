#!/usr/bin/env python3
"""
Modified version of prediction.py that listens on all interfaces (0.0.0.0)
This allows the service to be accessible from other machines or containers
without needing Docker.
"""

import os
import sys
import logging

# Add the current directory to the path so we can import from the original prediction.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import everything from the original prediction.py
from prediction import *

if __name__ == "__main__":
    # Get host and port from environment variables or use defaults
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8088))
    
    logging.info(f"Starting prediction service on {host}:{port}")
    print(f"Prediction service is running on http://{host}:{port}")
    print(f"Health check: http://{host}:{port}/health")
    print(f"Press Ctrl+C to stop the service")
    
    import uvicorn
    uvicorn.run(app, host=host, port=port)