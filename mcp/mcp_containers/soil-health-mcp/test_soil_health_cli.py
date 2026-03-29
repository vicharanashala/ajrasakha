#!/usr/bin/env python
import asyncio
import argparse
import sys
import json
from server import soilhealth_get_fertilizer_recommendations

async def main():
    parser = argparse.ArgumentParser(description="Soil Health MCP CLI Test Tool")
    
    # State, District, Crops
    parser.add_argument("--state", required=True, help="State Name or ID")
    parser.add_argument("--district", help="District Name or ID")
    parser.add_argument("--crops", nargs="+", help="One or more Crop Names or IDs")
    
    # Soil Values
    parser.add_argument("--n", type=float, help="Nitrogen (mg/kg)")
    parser.add_argument("--p", type=float, help="Phosphorus (mg/kg)")
    parser.add_argument("--k", type=float, help="Potassium (mg/kg)")
    parser.add_argument("--oc", type=float, help="Organic Carbon (%)")
    
    # Other options
    parser.add_argument("--natural", action="store_true", help="Use natural farming recommendations")
    parser.add_argument("--json", action="store_true", help="Output raw JSON response")

    args = parser.parse_args()

    print(f"\n🚀 Fetching recommendations for {args.state}...")
    
    result = await soilhealth_get_fertilizer_recommendations(
        state=args.state,
        district=args.district,
        crops=args.crops,
        n=args.n,
        p=args.p,
        k=args.k,
        oc=args.oc,
        natural_farming=args.natural
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    if result.get("success"):
        recommendations = result.get("recommendations", [])
        print(f"✅ Found {len(recommendations)} recommendations\n")
        
        for rec in recommendations:
            print(f"🌾 CROP: {rec.get('crop')}")
            recs = rec.get("recommendations", {})
            
            for key in ["primary", "alternative", "organic"]:
                if key in recs:
                    info = recs[key]
                    print(f"\n  ✓ {info.get('label')}:")
                    if key == "organic":
                        for k, v in info.get("details", {}).items():
                            print(f"    - {k.replace('_', ' ').title()}: {v}")
                    else:
                        for fert in info.get("fertilizers", []):
                            print(f"    - {fert.get('name')}: {fert.get('values')} {fert.get('unit')}")
            print("-" * 40)
    else:
        print(f"❌ FAILED: {result.get('error')}")
        print(f"   Detail: {result.get('detail')}")
        if result.get("errors"):
            print(f"   GraphQL Errors: {json.dumps(result['errors'], indent=2)}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)
