from typing import Dict, Any

def get_imd_agro_alerts() -> Dict[str, Any]:
    zones = [
        {
            "id": "roorkee",
            "city": "Roorkee, Uttarakhand",
            "agro_zone": "Upper Indo-Gangetic Plains",
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 31.7,
            "wind": "6.8 km/h",
            "humidity": "70%",
            "condition": "साफ आसमान / Fair",
            "major_crops": "Sugarcane, Wheat, Mustard",
            "advisory": "Stable and pleasant agricultural weather. Ideal window for scheduled irrigation and intercultural operations."
        },
        {
            "id": "shimla",
            "city": "Shimla, Himachal Pradesh",
            "agro_zone": "Himalayan Horticulture Zone",
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 18.2,
            "wind": "14.5 km/h",
            "humidity": "65%",
            "condition": "ठंडा व हल्के बादल / Partly Cloudy",
            "major_crops": "Apple, Stone Fruits, Veggies",
            "advisory": "Maintain orchard hygiene and clear irrigation drainage channels."
        },
        {
            "id": "ludhiana",
            "city": "Ludhiana, Punjab",
            "agro_zone": "North-Western Granary",
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 33.2,
            "wind": "11.2 km/h",
            "humidity": "58%",
            "condition": "धूप खिली / Mostly Sunny",
            "major_crops": "Wheat, Paddy, Cotton",
            "advisory": "Favorable conditions for foliar nutrient sprays. Monitor aphid threshold."
        },
        {
            "id": "bhopal",
            "city": "Bhopal, Madhya Pradesh",
            "agro_zone": "Central Black Soil Belt",
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 28.4,
            "wind": "8.5 km/h",
            "humidity": "62%",
            "condition": "साफ आसमान / Sunny",
            "major_crops": "Soybean, Gram (Chana), Wheat",
            "advisory": "Favorable for sowing preparations and light intercultural hoeing."
        },
        {
            "id": "jaipur",
            "city": "Jaipur, Rajasthan",
            "agro_zone": "Western Semi-Arid Zone",
            "status": "YELLOW ALERT",
            "status_desc": "HEAT/WATCH",
            "temp": 36.4,
            "wind": "16.0 km/h",
            "humidity": "35%",
            "condition": "गर्म व शुष्क / Warm & Dry",
            "major_crops": "Mustard, Bajra, Guar",
            "advisory": "High evaporation risk. Schedule irrigation during evening or night hours."
        },
        {
            "id": "pune",
            "city": "Pune, Maharashtra",
            "agro_zone": "Deccan Plateau & Ghats",
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 29.2,
            "wind": "12.0 km/h",
            "humidity": "68%",
            "condition": "हल्की धूप / Pleasant",
            "major_crops": "Sugarcane, Onion, Grapes",
            "advisory": "Moderate humidity favorable for crop growth. Spray preventive bio-fungicide."
        }
    ]
    return {"zones": zones, "active_location": zones[0]}

def get_crop_smart_advisory(crop_name: str = "Wheat") -> Dict[str, Any]:
    advisories = {
        "Wheat": {
            "crop_label": "Wheat (गेहूँ)",
            "spray_window": {
                "badge": "SAFE TO SPRAY",
                "title": "Favorable Wind & Zero Rain Risk",
                "details": "Wind speed is 6.8 km/h with dry conditions. Excellent window for WHEAT foliar fungicide/insecticide spray."
            },
            "irrigation": {
                "badge": "IRRIGATION RECOMMENDED",
                "title": "Dry Soil & No Imminent Rain",
                "details": "Clear skies forecasted for the next 48h. Provide light evening irrigation to maintain root zone moisture."
            },
            "pest_index": {
                "badge": "MODERATE SURVEILLANCE",
                "title": "Aphid & Sucking Pest Alert",
                "details": "Current temperature (32°C) favors sucking pests in wheat. Inspect leaf undersides regularly."
            }
        },
        "Paddy": {
            "crop_label": "Paddy / Rice (धान)",
            "spray_window": {
                "badge": "SAFE TO SPRAY",
                "title": "Optimal Morning Application",
                "details": "Spray bio-stimulants or blast preventative fungicides during early morning dew clearance."
            },
            "irrigation": {
                "badge": "MAINTAIN STANDING WATER",
                "title": "Critical Tillering Stage",
                "details": "Ensure 3-5 cm standing water layer is maintained in field plots."
            },
            "pest_index": {
                "badge": "HIGH SURVEILLANCE",
                "title": "Stem Borer & Leaf Folder Watch",
                "details": "Install pheromone traps @ 5 traps/acre for timely threshold detection."
            }
        },
        "Mustard": {
            "crop_label": "Mustard (सरसों)",
            "spray_window": {
                "badge": "CONDITIONAL SPRAY",
                "title": "Spray After 4 PM",
                "details": "Avoid daytime spraying to protect foraging honeybee pollinators in flowering fields."
            },
            "irrigation": {
                "badge": "MOISTURE CONSERVATION",
                "title": "Pod Formation Stage",
                "details": "Apply final light irrigation to aid grain filling."
            },
            "pest_index": {
                "badge": "HIGH SURVEILLANCE",
                "title": "Mustard Aphid Alert",
                "details": "Check top 10 cm of central floral twigs for aphid colonies."
            }
        }
    }
    return advisories.get(crop_name, advisories["Wheat"])
