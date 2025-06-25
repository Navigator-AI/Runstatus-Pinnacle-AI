#!/bin/bash

# Script to run the prediction service on all interfaces

# Change to the PREDICTION-MODULE directory
cd "$(dirname "$0")"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not in PATH"
    exit 1
fi

# Check if the prediction_all_interfaces.py file exists
if [ ! -f "prediction_all_interfaces.py" ]; then
    echo "Error: prediction_all_interfaces.py not found"
    exit 1
fi

# Run the prediction service
echo "Starting prediction service on all interfaces (0.0.0.0:8088)..."
python3 prediction_all_interfaces.py

# This line will only be reached if the service stops
echo "Prediction service has stopped."