#!/usr/bin/env python3
"""
Analyze prediction accuracy and improve route slack predictions
"""
import requests
import json
import numpy as np

def analyze_prediction_accuracy():
    print("🔍 Analyzing Route Slack Prediction Accuracy...")
    
    # First, let's get some predictions to analyze
    response = requests.post("http://127.0.0.1:8088/slack-prediction/predict", json={
        "place_table": "reg_place_csv",
        "cts_table": "reg_cts_csv"
    })
    
    if response.status_code != 200:
        print(f"❌ Prediction failed: {response.status_code}")
        return
    
    result = response.json()
    data = result.get('data', [])
    
    if not data:
        print("❌ No prediction data received")
        return
    
    print(f"📊 Analyzing {len(data)} predictions...")
    
    # First, let's see what keys are available
    if data:
        print(f"🔍 Available keys in response: {list(data[0].keys())}")
    
    # Extract values for analysis - check for different possible key names
    place_slacks = []
    cts_slacks = []
    route_slacks = []
    
    for row in data:
        # Try different possible key names
        place_slack = row.get('place_slack') or row.get('slack_place') or row.get('place')
        cts_slack = row.get('cts_slack') or row.get('slack_cts') or row.get('cts')
        route_slack = row.get('route_slack') or row.get('slack_route') or row.get('route') or row.get('predicted_slack') or row.get('predicted_route_slack')
        
        if place_slack is not None:
            place_slacks.append(place_slack)
        if cts_slack is not None:
            cts_slacks.append(cts_slack)
        if route_slack is not None:
            route_slacks.append(route_slack)
    
    print(f"📊 Extracted {len(place_slacks)} place, {len(cts_slacks)} CTS, {len(route_slacks)} route slack values")
    
    if not route_slacks:
        print("❌ No route slack values found. Available keys in first row:")
        if data:
            for key, value in data[0].items():
                print(f"   {key}: {value}")
        return
    
    # Calculate statistics
    place_stats = {
        'min': min(place_slacks),
        'max': max(place_slacks),
        'mean': np.mean(place_slacks),
        'std': np.std(place_slacks)
    }
    
    cts_stats = {
        'min': min(cts_slacks),
        'max': max(cts_slacks),
        'mean': np.mean(cts_slacks),
        'std': np.std(cts_slacks)
    }
    
    route_stats = {
        'min': min(route_slacks),
        'max': max(route_slacks),
        'mean': np.mean(route_slacks),
        'std': np.std(route_slacks)
    }
    
    print(f"\n📈 Statistical Analysis:")
    print(f"Place Slack  - Min: {place_stats['min']:.5f}, Max: {place_stats['max']:.5f}, Mean: {place_stats['mean']:.5f}, Std: {place_stats['std']:.5f}")
    print(f"CTS Slack    - Min: {cts_stats['min']:.5f}, Max: {cts_stats['max']:.5f}, Mean: {cts_stats['mean']:.5f}, Std: {cts_stats['std']:.5f}")
    print(f"Route Slack  - Min: {route_stats['min']:.5f}, Max: {route_stats['max']:.5f}, Mean: {route_stats['mean']:.5f}, Std: {route_stats['std']:.5f}")
    
    # Analyze the relationship
    print(f"\n🔍 Relationship Analysis:")
    
    # Expected route slack should be related to place and CTS slack
    # Let's see what the current model is predicting vs what might be expected
    
    expected_route_min = min(place_stats['min'], cts_stats['min'])
    expected_route_max = max(place_stats['max'], cts_stats['max'])
    
    print(f"Expected Route Range: {expected_route_min:.5f} to {expected_route_max:.5f}")
    print(f"Actual Route Range:   {route_stats['min']:.5f} to {route_stats['max']:.5f}")
    
    # Check if route predictions are reasonable
    if route_stats['mean'] < min(place_stats['mean'], cts_stats['mean']) - 0.1:
        print("⚠️  Route predictions are significantly lower than input slacks")
        accuracy_issue = "too_low"
    elif route_stats['mean'] > max(place_stats['mean'], cts_stats['mean']) + 0.1:
        print("⚠️  Route predictions are significantly higher than input slacks")
        accuracy_issue = "too_high"
    else:
        print("✅ Route predictions are in reasonable range")
        accuracy_issue = "reasonable"
    
    # Show sample comparisons
    print(f"\n📋 Sample Comparisons (First 10 rows):")
    print("Row | Place Slack | CTS Slack   | Route Slack | Difference")
    print("----|-------------|-------------|-------------|------------")
    
    for i in range(min(10, len(place_slacks))):
        place = place_slacks[i]
        cts = cts_slacks[i] if i < len(cts_slacks) else place
        route = route_slacks[i] if i < len(route_slacks) else 0
        avg_input = (place + cts) / 2
        diff = route - avg_input
        print(f"{i+1:3d} | {place:11.5f} | {cts:11.5f} | {route:11.5f} | {diff:+10.5f}")
    
    # Calculate correlation if possible
    try:
        avg_inputs = [(place_slacks[i] + cts_slacks[i]) / 2 for i in range(len(data))]
        correlation = np.corrcoef(avg_inputs, route_slacks)[0, 1]
        print(f"\n📊 Correlation between average input slack and route slack: {correlation:.4f}")
        
        if correlation < 0.5:
            print("⚠️  Low correlation suggests model needs improvement")
        else:
            print("✅ Good correlation between inputs and outputs")
            
    except Exception as e:
        print(f"Could not calculate correlation: {e}")
    
    return {
        'accuracy_issue': accuracy_issue,
        'place_stats': place_stats,
        'cts_stats': cts_stats,
        'route_stats': route_stats,
        'sample_data': data[:10]
    }

if __name__ == "__main__":
    analyze_prediction_accuracy()