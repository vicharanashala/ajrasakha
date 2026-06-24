"""Test script for time-based expert disclaimer."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Import after setting up path
import sys
sys.path.insert(0, "/Users/aryankohli/ajrasakha/ai")

from ajrasakha.agents.answer_footers import get_time_aware_expert_disclaimer


def test_scenario(hour: int, expected_contains: str, script: str = "English", vocal: str = "English"):
    """Test a specific hour scenario."""
    # Create a mock datetime for the given hour in IST
    test_time = datetime(2026, 6, 12, hour, 30, 0, tzinfo=IST)  # June 12, 2026, HH:30:00 IST
    
    with patch("ajrasakha.agents.answer_footers.datetime") as mock_datetime:
        mock_datetime.now.return_value = test_time
        mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
        
        result = get_time_aware_expert_disclaimer(script, vocal)
        
    print(f"\n{'='*60}")
    print(f"Testing hour {hour:02d}:00 IST (script={script}, vocal={vocal})")
    print(f"Expected to contain: '{expected_contains}'")
    print(f"Result: {result}")
    
    if expected_contains in result:
        print("✅ PASS")
        return True
    else:
        print("❌ FAIL")
        return False


def main():
    print("Testing time-based expert disclaimer (sheet-based)")
    print("=" * 60)
    
    results = []
    
    # Scenario 1: Late night (22-23 hours) - late night disclaimer from sheet
    print("\n--- SCENARIO 1: Late Night (10:01 PM - 11:59 PM) ---")
    results.append(test_scenario(22, "8:00 AM", "English", "English"))
    results.append(test_scenario(23, "8:00 AM", "English", "English"))
    
    # Scenario 2: Early morning (0-5 hours) - early morning disclaimer from sheet
    print("\n--- SCENARIO 2: Early Morning (12:00 AM - 5:59 AM) ---")
    results.append(test_scenario(0, "8:00 AM", "English", "English"))
    results.append(test_scenario(3, "8:00 AM", "English", "English"))
    results.append(test_scenario(5, "8:00 AM", "English", "English"))
    
    # Scenario 3: Normal hours (6-21 hours) - 2-hour disclaimer from sheet
    print("\n--- SCENARIO 3: Normal Hours (6:00 AM - 9:59 PM) ---")
    results.append(test_scenario(6, "2", "English", "English"))
    results.append(test_scenario(12, "2", "English", "English"))
    results.append(test_scenario(18, "2", "English", "English"))
    results.append(test_scenario(21, "2", "English", "English"))
    
    print("\n" + "=" * 60)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    
    if all(results):
        print("🎉 All tests passed!")
    else:
        print("⚠️ Some tests failed!")


if __name__ == "__main__":
    main()
