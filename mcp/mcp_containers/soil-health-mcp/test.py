#!/usr/bin/env python
"""
Soil Health MCP - Configuration-Based Manual Testing
Edit the CONFIGURATION section below to test different values
"""

import asyncio
from server import (
    soilhealth_get_states,
    soilhealth_get_districts_by_state,
    soilhealth_get_crop_registries,
    soilhealth_get_fertilizer_recommendations
)

# ============================================================================
# 🔧 CONFIGURATION - EDIT THESE VALUES TO TEST
# ============================================================================

CONFIGURATION = {
    # Select State - Use EXACT name (copy from displayed list)
    "STATE_NAME": "UTTAR PRADESH",
    
    # Select District - Use EXACT name (copy from displayed list, or None to skip)
    "DISTRICT_NAME": None,
    
    # Select Crop(s) - Use EXACT names (copy from displayed list)
    "CROP_NAMES": [
        "बैंगन (All Variety)"
    ],
    
    # Soil Test Parameters
    "NITROGEN_N_mg_kg": 20,
    "PHOSPHORUS_P_mg_kg": 15,
    "POTASSIUM_K_mg_kg": 1000,
    "ORGANIC_CARBON_OC_PERCENT": 10,
}

# ============================================================================
# END OF CONFIGURATION
# ============================================================================


async def test_workflow():
    """Run test with configured values"""
    
    print("\n" + "=" * 80)
    print("SOIL HEALTH MCP - CONFIGURATION-BASED TEST")
    print("=" * 80)
    
    print("\n" + "=" * 80)
    print("📋 CURRENT CONFIGURATION:")
    print("=" * 80)
    print(f"  State: {CONFIGURATION['STATE_NAME']}")
    print(f"  District: {CONFIGURATION['DISTRICT_NAME'] or 'None (Optional)'}")
    print(f"  Crops: {', '.join(CONFIGURATION['CROP_NAMES'])}")
    print(f"\n  Soil Test Values:")
    print(f"    N (Nitrogen): {CONFIGURATION['NITROGEN_N_mg_kg']} mg/kg")
    print(f"    P (Phosphorus): {CONFIGURATION['PHOSPHORUS_P_mg_kg']} mg/kg")
    print(f"    K (Potassium): {CONFIGURATION['POTASSIUM_K_mg_kg']} mg/kg")
    print(f"    OC (Organic Carbon): {CONFIGURATION['ORGANIC_CARBON_OC_PERCENT']}%")
    
    # STEP 1: Get all states
    print("\n" + "=" * 80)
    print("STEP 1: FETCHING ALL STATES...")
    print("=" * 80)
    
    states_result = await soilhealth_get_states()
    
    if not states_result.get('success'):
        print(f"❌ Error: {states_result.get('error')}")
        return
    
    states = states_result['states']
    print(f"✅ Found {len(states)} states\n")
    
    # STEP 2: Find selected state (exact name match only, no patterns)
    print("=" * 80)
    print("STEP 2: FINDING SELECTED STATE...")
    print("=" * 80)
    
    selected_state = None
    for state in states:
        if state['name'] == CONFIGURATION['STATE_NAME']:  # Exact match only
            selected_state = state
            break
    
    if not selected_state:
        print(f"❌ State '{CONFIGURATION['STATE_NAME']}' not found!")
        print(f"\n📋 ALL AVAILABLE STATES (copy exact names from here):")
        print("-" * 80)
        for i, state in enumerate(states, 1):
            print(f"{i:3d}. {state['name']}")
        print("-" * 80)
        print(f"\n💡 Copy exact state name from the list above and update CONFIGURATION['STATE_NAME']")
        return
    
    print(f"✅ Found state: {selected_state['name']}")
    
    # STEP 3: Get ALL districts (show complete list by names only)
    selected_district = None
    if CONFIGURATION['DISTRICT_NAME']:
        print("\n" + "=" * 80)
        print("STEP 3: FINDING SELECTED DISTRICT...")
        print("=" * 80)
        
        districts_result = await soilhealth_get_districts_by_state(selected_state['_id'])
        districts = districts_result.get('districts', [])
        
        if districts:
            print(f"✅ Found {len(districts)} districts\n")
            
            print("📋 ALL AVAILABLE DISTRICTS (copy exact names from here):")
            print("-" * 80)
            for i, dist in enumerate(districts, 1):
                # Display name only (from "name" field)
                district_name = dist.get('name', 'Unknown')
                print(f"{i:3d}. {district_name}")
            print("-" * 80)
            
            # Find by EXACT name match only (no pattern)
            for dist in districts:
                if dist.get('name') == CONFIGURATION['DISTRICT_NAME']:
                    selected_district = dist
                    break
            
            if selected_district:
                print(f"\n✅ Found district: {selected_district['name']}")
            else:
                print(f"\n❌ District '{CONFIGURATION['DISTRICT_NAME']}' not found!")
                print(f"💡 Copy exact name from the list above and update CONFIGURATION['DISTRICT_NAME']")
                return
        else:
            print(f"⚠️  No districts available for {selected_state['name']}")
            print(f"   Proceeding without district selection...")

    
    # STEP 4: Get crops
    print("\n" + "=" * 80)
    print("STEP 4: FETCHING CROPS...")
    print("=" * 80)
    
    crops_result = await soilhealth_get_crop_registries(selected_state['_id'])
    
    if not crops_result.get('success'):
        print(f"❌ Error: {crops_result.get('error')}")
        print(f"   Detail: {crops_result.get('detail')}")
        print(f"   Full result: {crops_result}")
        return
    
    crops = crops_result['crops']
    print(f"✅ Found {len(crops)} crops available in {selected_state['name']}\n")
    
    print("📋 ALL AVAILABLE CROPS (copy exact names from here):")
    print("-" * 80)
    for i, crop in enumerate(crops, 1):
        # Display name only (from "name" field)
        crop_name = crop.get('name', 'Unknown')
        print(f"{i:3d}. {crop_name}")
    print("-" * 80)
    
    # Find crops by exact name match
    selected_crops = []
    for crop_name in CONFIGURATION['CROP_NAMES']:
        for crop in crops:
            if crop.get('name') == crop_name:
                selected_crops.append(crop)
                break
    
    if not selected_crops:
        print(f"\n❌ No crops found matching the configured names!")
        print(f"\nConfigured crops:")
        for name in CONFIGURATION['CROP_NAMES']:
            print(f"  - {name}")
        print(f"\n💡 Copy exact names from the list above and update CONFIGURATION['CROP_NAMES']")
        return
    
    print(f"\n✅ Found {len(selected_crops)} crop(s) matching configuration:")
    for i, crop in enumerate(selected_crops, 1):
        print(f"  {i}. {crop.get('name')}")
    
    # STEP 5: Get recommendations
    print("\n" + "=" * 80)
    print("STEP 5: GETTING FERTILIZER RECOMMENDATIONS...")
    print("=" * 80)
    
    # Extract crop IDs for the API call (hidden from user - only names displayed)
    crop_ids = [crop['id'] for crop in selected_crops]
    
    print(f"\nTesting with parameters:")
    print(f"  State: {selected_state['name']}")
    if selected_district:
        print(f"  District: {selected_district['name']}")
    print(f"  Nitrogen (N): {CONFIGURATION['NITROGEN_N_mg_kg']} mg/kg")
    print(f"  Phosphorus (P): {CONFIGURATION['PHOSPHORUS_P_mg_kg']} mg/kg")
    print(f"  Potassium (K): {CONFIGURATION['POTASSIUM_K_mg_kg']} mg/kg")
    print(f"  Organic Carbon (OC): {CONFIGURATION['ORGANIC_CARBON_OC_PERCENT']}%")
    
    result = await soilhealth_get_fertilizer_recommendations(
        state=selected_state['_id'],
        district=selected_district['id'] if selected_district else None,
        n=CONFIGURATION['NITROGEN_N_mg_kg'],
        p=CONFIGURATION['PHOSPHORUS_P_mg_kg'],
        k=CONFIGURATION['POTASSIUM_K_mg_kg'],
        oc=CONFIGURATION['ORGANIC_CARBON_OC_PERCENT'],
        crops=crop_ids
    )
    
    # Display results
    print("\n" + "=" * 80)
    print("📊 RESULTS:")
    print("=" * 80)
    
    if result.get('success'):
        recommendations = result.get('recommendations', [])
        print(f"✅ SUCCESS: Received recommendations for {len(recommendations)} crops")
        
        if recommendations:
            for rec in recommendations:
                crop_name = rec.get('crop', 'Unknown Crop')
                print(f"\n🌾 Crop: {crop_name[:70]}")
                
                rec_data = rec.get('recommendations', {})
                if rec_data and isinstance(rec_data, dict):
                    print("  Recommendations:")
                    
                    # Primary fertilizer combination
                    if 'primary' in rec_data:
                        primary = rec_data['primary']
                        print(f"\n  ✓ {primary.get('label', 'Primary Fertilizer')}")
                        for fert in primary.get('fertilizers', []):
                            print(f"    - {fert.get('name', 'Unknown')}: {fert.get('values', 'N/A')} {fert.get('unit', 'N/A')}")
                    
                    # Alternative fertilizer combination
                    if 'alternative' in rec_data:
                        alt = rec_data['alternative']
                        print(f"\n  ✓ {alt.get('label', 'Alternative Fertilizer')}")
                        for fert in alt.get('fertilizers', []):
                            print(f"    - {fert.get('name', 'Unknown')}: {fert.get('values', 'N/A')} {fert.get('unit', 'N/A')}")
                    
                    # Organic farming recommendations
                    if 'organic' in rec_data:
                        organic = rec_data['organic']
                        print(f"\n  ✓ {organic.get('label', 'Organic Farming')}")
                        details = organic.get('details', {})
                        if details:
                            for key, value in details.items():
                                print(f"    - {key.replace('_', ' ').title()}: {value}")
                else:
                    print(f"  Data: {rec_data}")
        else:
            print("⚠️  No recommendations returned (may not be available for this combination)")
    else:
        print(f"❌ Error: {result.get('error')}")
        if result.get('errors'):
            print(f"  Details: {result['errors']}")
        print("\n💡 Tips:")
        print("  - Check if this state/district/crop combination has recommendations available")
        print("  - Try different soil values")
        print("  - Try different crops")
    
    # Comparison with website
    print("\n" + "=" * 80)
    print("🔗 TO VERIFY WITH WEBSITE:")
    print("=" * 80)
    print(f"\n1. Go to: https://soilhealth4.dac.gov.in")
    print(f"2. Select State: {selected_state['name']}")
    if selected_district:
        print(f"3. Select District: {selected_district['name']}")
    else:
        print(f"3. (No district selected)")
    print(f"4. Select Crop: {selected_crops[0]['name']}")
    print(f"5. Enter Soil Values:")
    print(f"   - Nitrogen (N): {CONFIGURATION['NITROGEN_N_mg_kg']} mg/kg")
    print(f"   - Phosphorus (P): {CONFIGURATION['PHOSPHORUS_P_mg_kg']} mg/kg")
    print(f"   - Potassium (K): {CONFIGURATION['POTASSIUM_K_mg_kg']} mg/kg")
    print(f"   - Organic Carbon (OC): {CONFIGURATION['ORGANIC_CARBON_OC_PERCENT']}%")
    print(f"\n6. Compare the recommendations shown on website with results above")
    
    print("\n" + "=" * 80)
    print("✅ TEST COMPLETE")
    print("=" * 80)
    print("\n💡 To run with different values:")
    print("   1. Edit the CONFIGURATION section at the top of this file")
    print("   2. Save the file")
    print("   3. Run: python test.py\n")


if __name__ == "__main__":
    try:
        asyncio.run(test_workflow())
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
