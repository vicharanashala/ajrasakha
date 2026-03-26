"""
Verify that ALL districts are retrieved for ALL states without skipping.
"""

import asyncio
import json
from server import soilhealth_get_states, soilhealth_get_districts_by_state

async def verify_all_states():
    """Test all states to ensure all districts are retrieved"""
    
    print("\n" + "="*80)
    print("VERIFYING DISTRICT RETRIEVAL FOR ALL STATES")
    print("="*80)
    
    # Get all states
    states_result = await soilhealth_get_states()
    if not states_result.get('success'):
        print(f"❌ Failed to fetch states: {states_result.get('error')}")
        return
    
    states = states_result.get('states', [])
    print(f"\n✅ Found {len(states)} states\n")
    
    # Track results
    results = []
    states_with_zero_districts = []
    
    # Test each state
    for i, state in enumerate(states, 1):
        state_name = state.get('name', 'Unknown')
        state_id = state.get('_id')
        
        # Fetch districts with default parameters (subdistrict=True)
        districts_result = await soilhealth_get_districts_by_state(state_id, subdistrict=True)
        
        if districts_result.get('success'):
            districts = districts_result.get('districts', [])
            count = len(districts)
            
            status = "✅"
            if count == 0:
                status = "⚠️ "
                states_with_zero_districts.append((state_name, state_id))
            
            print(f"{i:2d}. {status} {state_name:30s} → {count:4d} districts/subdistricts")
            
            results.append({
                'state': state_name,
                'count': count,
                'success': True
            })
        else:
            print(f"{i:2d}. ❌ {state_name:30s} → ERROR: {districts_result.get('error')}")
            results.append({
                'state': state_name,
                'count': 0,
                'success': False,
                'error': districts_result.get('error')
            })
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    successful = sum(1 for r in results if r.get('success'))
    total_districts = sum(r.get('count', 0) for r in results)
    
    print(f"✅ States with districts retrieved: {successful}/{len(states)}")
    print(f"📊 Total districts/subdistricts across all states: {total_districts}")
    
    if states_with_zero_districts:
        print(f"\n⚠️  States with ZERO districts (need investigation):")
        for state_name, state_id in states_with_zero_districts:
            print(f"   - {state_name} (ID: {state_id})")
            print(f"     Trying with subdistrict=False...")
            
            # Try without subdistricts
            alt_result = await soilhealth_get_districts_by_state(state_id, subdistrict=False)
            if alt_result.get('success'):
                alt_count = len(alt_result.get('districts', []))
                if alt_count > 0:
                    print(f"     Found {alt_count} districts with subdistrict=False")
                else:
                    print(f"     Still zero districts with subdistrict=False - API returns empty")
    
    print("\n" + "="*80)
    print("VERIFICATION COMPLETE")
    print("="*80)

if __name__ == "__main__":
    asyncio.run(verify_all_states())
