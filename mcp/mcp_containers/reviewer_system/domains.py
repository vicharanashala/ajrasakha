# 1. Domains that REQUIRE a specific crop (crop_required_domains)
crop_required_domains = {
    # --- Your Primary Domains ---
    "Agriculture Mechanization",
    "Bio-Pesticides and Bio-Fertilizers",
    "Crop Insurance",
    "Cultural Practices",
    "Fertilizer Use and Availability",
    "Field Preparation",
    "Nutrient Management",
    "Organic Farming",
    "Plant Protection",
    "Post Harvest Preservation",
    "Seeds",
    "Soil Testing",
    "Sowing Time and Weather",
    "Storage",
    "Varieties",
    "Water Management",
    "Weed Management",
    "Market Information",
    
    # --- Umbrella Domain (Plant-based) ---
    "Horticulture & Allied Agriculture"
}

# 2. Domains where crop is automatically "all" / Non-Crop (crop_all_domains)
crop_all_domains = {
    # --- Your Primary Domain ---
    "Soil Health Card",
    
    # --- Umbrella Domains (Non-Crop / Livestock / General) ---
    "Livestock & Animal Husbandry",
    "Veterinary & Animal Health",
    "Fisheries & Aquaculture",
    "Financial & Institutional Services",
    "Extension & Capacity Building",
    "Infrastructure & Utilities"
}

# The master list of all valid domains for your MCP system
allowed_domains = crop_required_domains | crop_all_domains