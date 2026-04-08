#!/usr/bin/env python3
"""
Test script for IMD Weather API Wrapper - 6 endpoints
Tests all 6 priority IMD weather endpoints identified from KCC analysis
"""

import requests
import json
import time
from typing import Dict, Any

# Configuration
BASE_URL = "http://100.100.108.43:6003"  # Deployed server
TIMEOUT = 30

def test_endpoint(name: str, url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Test a single endpoint and return results"""
    print(f"\n🧪 Testing {name}...")
    print(f"   URL: {url}")
    print(f"   Params: {params}")

    try:
        start_time = time.time()
        response = requests.get(url, params=params, timeout=TIMEOUT)
        end_time = time.time()

        result = {
            "endpoint": name,
            "url": url,
            "params": params,
            "status_code": response.status_code,
            "response_time": round(end_time - start_time, 2),
            "success": response.status_code == 200
        }

        if response.status_code == 200:
            try:
                data = response.json()
                result["data"] = data
                print(f"   ✅ SUCCESS ({result['response_time']}s)")
                print(f"   📊 Data keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
            except json.JSONDecodeError:
                result["data"] = response.text
                print(f"   ⚠️  SUCCESS but invalid JSON ({result['response_time']}s)")
        else:
            result["error"] = response.text
            print(f"   ❌ FAILED: {response.status_code} ({result['response_time']}s)")
            print(f"   Error: {response.text[:200]}...")

        return result

    except requests.exceptions.RequestException as e:
        print(f"   ❌ ERROR: {str(e)}")
        return {
            "endpoint": name,
            "url": url,
            "params": params,
            "success": False,
            "error": str(e)
        }

def main():
    """Test all 6 IMD weather API endpoints"""

    print("🌤️  IMD Weather API Wrapper - Endpoint Testing")
    print("=" * 60)
    print(f"Server: {BASE_URL}")
    print("Testing all 6 priority endpoints from KCC analysis\n")

    # Test data
    test_city = "Lucknow"
    test_district = "Lucknow"
    test_state = "Uttar Pradesh"
    test_crop = "Paddy"

    # Define all 6 endpoints to test
    endpoints = [
        {
            "name": "City Forecast (CRITICAL)",
            "path": "/weather/city-forecast",
            "params": {"city": test_city, "state": test_state}
        },
        {
            "name": "District Forecast (HIGH)",
            "path": "/weather/district-forecast",
            "params": {"district": test_district, "state": test_state}
        },
        {
            "name": "Rainfall Forecast (MEDIUM)",
            "path": "/weather/rainfall-forecast",
            "params": {"district": test_district, "state": test_state, "days": 3}
        },
        {
            "name": "Current Weather (MEDIUM)",
            "path": "/weather/current",
            "params": {"city": test_city, "state": test_state}
        },
        {
            "name": "Nowcast (LOW)",
            "path": "/weather/nowcast",
            "params": {"district": test_district, "state": test_state}
        },
        {
            "name": "Agromet Advisory (LOW)",
            "path": "/weather/agromet-advisory",
            "params": {"district": test_district, "state": test_state, "crop": test_crop}
        }
    ]

    results = []

    # Test each endpoint
    for endpoint in endpoints:
        url = f"{BASE_URL}{endpoint['path']}"
        result = test_endpoint(endpoint['name'], url, endpoint['params'])
        results.append(result)
        time.sleep(1)  # Brief pause between requests

    # Test the full profile endpoint
    print(f"\n🧪 Testing Full Profile (ALL ENDPOINTS)...")
    full_profile_url = f"{BASE_URL}/weather/full-profile"
    full_profile_params = {
        "city": test_city,
        "district": test_district,
        "state": test_state,
        "crop": test_crop
    }

    try:
        start_time = time.time()
        response = requests.get(full_profile_url, params=full_profile_params, timeout=TIMEOUT)
        end_time = time.time()

        full_result = {
            "endpoint": "Full Profile (ALL)",
            "url": full_profile_url,
            "params": full_profile_params,
            "status_code": response.status_code,
            "response_time": round(end_time - start_time, 2),
            "success": response.status_code == 200
        }

        if response.status_code == 200:
            try:
                data = response.json()
                full_result["data"] = data
                print(f"   ✅ SUCCESS ({full_result['response_time']}s)")
                if isinstance(data, dict):
                    print(f"   📊 Contains {len(data)} top-level keys")
                    for key in data.keys():
                        if isinstance(data[key], dict):
                            print(f"      - {key}: {len(data[key])} sub-keys")
                        else:
                            print(f"      - {key}: {type(data[key]).__name__}")
            except json.JSONDecodeError:
                full_result["data"] = response.text
                print(f"   ⚠️  SUCCESS but invalid JSON ({full_result['response_time']}s)")
        else:
            full_result["error"] = response.text
            print(f"   ❌ FAILED: {response.status_code} ({full_result['response_time']}s)")

        results.append(full_result)

    except requests.exceptions.RequestException as e:
        print(f"   ❌ ERROR: {str(e)}")
        results.append({
            "endpoint": "Full Profile (ALL)",
            "url": full_profile_url,
            "params": full_profile_params,
            "success": False,
            "error": str(e)
        })

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)

    successful = sum(1 for r in results if r.get("success", False))
    total = len(results)

    print(f"Total endpoints tested: {total}")
    print(f"Successful: {successful}")
    print(f"Failed: {total - successful}")
    print(".1f")

    # Detailed results
    print("\n📋 DETAILED RESULTS:")
    for result in results:
        status = "✅" if result.get("success") else "❌"
        response_time = result.get("response_time", "N/A")
        print(f"{status} {result['endpoint']} - {response_time}s")

    # Save results to file
    output_file = "imd_api_test_results.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n💾 Detailed results saved to: {output_file}")

    return results

if __name__ == "__main__":
    main()