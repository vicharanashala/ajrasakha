import type { IStateDistrictData } from "../types";

export const INDIAN_AGRI_STATES: IStateDistrictData[] = [
  {
    state: "Punjab",
    stateHi: "पंजाब",
    districts: ["Ludhiana", "Patiala", "Amritsar", "Bathinda", "Jalandhar", "Sangrur", "Ferozepur", "Gurdaspur", "Mansa", "Hoshiarpur"],
  },
  {
    state: "Haryana",
    stateHi: "हरियाणा",
    districts: ["Karnal", "Hisar", "Ambala", "Kurukshetra", "Sirsa", "Rohtak", "Sonipat", "Fatehabad", "Bhiwani", "Jind"],
  },
  {
    state: "Uttar Pradesh",
    stateHi: "उत्तर प्रदेश",
    districts: ["Meerut", "Varanasi", "Gorakhpur", "Agra", "Aligarh", "Bareilly", "Bulandshahr", "Muzaffarnagar", "Prayagraj", "Mathura", "Ayodhya", "Sitapur"],
  },
  {
    state: "Madhya Pradesh",
    stateHi: "मध्य प्रदेश",
    districts: ["Indore", "Ujjain", "Bhopal", "Hoshangabad", "Dewas", "Sehore", "Gwalior", "Jabalpur", "Vidisha", "Chhindwara"],
  },
  {
    state: "Rajasthan",
    stateHi: "राजस्थान",
    districts: ["Sri Ganganagar", "Hanumangarh", "Kota", "Nagaur", "Jaipur", "Alwar", "Barmer", "Jodhpur", "Bikaner", "Chittorgarh"],
  },
  {
    state: "Maharashtra",
    stateHi: "महाराष्ट्र",
    districts: ["Nashik", "Pune", "Ahmednagar", "Solapur", "Kolhapur", "Nagpur", "Amravati", "Aurangabad", "Yavatmal", "Jalgaon"],
  },
  {
    state: "Gujarat",
    stateHi: "गुजरात",
    districts: ["Rajkot", "Surat", "Junagadh", "Mehsana", "Amreli", "Banaskantha", "Bhavnagar", "Kheda", "Vadodara", "Patan"],
  },
  {
    state: "Bihar",
    stateHi: "बिहार",
    districts: ["Patna", "Muzaffarpur", "Bhagalpur", "Gaya", "Samastipur", "Rohtas", "Darbhanga", "Purnia", "Begusarai", "Nalanda"],
  },
  {
    state: "Karnataka",
    stateHi: "कर्नाटक",
    districts: ["Belagavi", "Tumakuru", "Mandya", "Mysuru", "Davangere", "Ballari", "Shivamogga", "Hassan", "Vijayapura", "Dharwad"],
  },
  {
    state: "Andhra Pradesh / Telangana",
    stateHi: "आंध्र प्रदेश / तेलंगाना",
    districts: ["Guntur", "Krishna", "Kurnool", "Warangal", "Nalgonda", "Karimnagar", "Khammam", "West Godavari", "Anantapur"],
  },
];

export const MAJOR_CROPS_LIST = [
  { id: "wheat", nameEn: "Wheat (गेहूं)", nameHi: "गेहूं", season: "Rabi" },
  { id: "paddy", nameEn: "Paddy / Rice (धान / चावल)", nameHi: "धान / चावल", season: "Kharif" },
  { id: "cotton", nameEn: "Cotton (कपास)", nameHi: "कपास", season: "Kharif" },
  { id: "mustard", nameEn: "Mustard / Rapeseed (सरसों / राई)", nameHi: "सरसों", season: "Rabi" },
  { id: "sugarcane", nameEn: "Sugarcane (गन्ना)", nameHi: "गन्ना", season: "Annual" },
  { id: "maize", nameEn: "Maize (मक्का)", nameHi: "मक्का", season: "Kharif/Rabi" },
  { id: "gram", nameEn: "Gram / Chana (चना)", nameHi: "चना", season: "Rabi" },
  { id: "soybean", nameEn: "Soybean (सोयाबीन)", nameHi: "सोयाबीन", season: "Kharif" },
  { id: "potato", nameEn: "Potato (आलू)", nameHi: "आलू", season: "Rabi" },
  { id: "onion", nameEn: "Onion / Garlic (प्याज / लहसुन)", nameHi: "प्याज / लहसुन", season: "Rabi/Kharif" },
  { id: "tomato", nameEn: "Tomato / Veggies (टमाटर / सब्जियां)", nameHi: "सब्जियां", season: "All" },
  { id: "fodder", nameEn: "Green Fodder (हरा चारा / बरसीम)", nameHi: "हरा चारा", season: "All" },
];

export const SOIL_TYPES_LIST = [
  { id: "alluvial", labelEn: "Alluvial Soil (जलोढ़ मिट्टी)", labelHi: "जलोढ़ उपजाऊ मिट्टी" },
  { id: "black", labelEn: "Black Cotton Soil (काली मिट्टी)", labelHi: "काली कपास मिट्टी" },
  { id: "loam", labelEn: "Sandy Loam Soil (दोमट मिट्टी)", labelHi: "दोमट मिट्टी" },
  { id: "clay", labelEn: "Clayey Heavy Soil (चिकनी मिट्टी)", labelHi: "चिकनी भारी मिट्टी" },
  { id: "sandy", labelEn: "Sandy Dry Soil (रेतीली मिट्टी)", labelHi: "रेतीली मिट्टी" },
  { id: "red", labelEn: "Red / Laterite Soil (लाल मिट्टी)", labelHi: "लाल मिट्टी" },
];

export const IRRIGATION_SOURCES_LIST = [
  { id: "borewell", labelEn: "Tubewell / Borewell (ट्यूबवेल / बोरवेल)", labelHi: "ट्यूबवेल / बोरवेल" },
  { id: "canal", labelEn: "Canal Water (नहरी पानी)", labelHi: "नहरी पानी" },
  { id: "drip", labelEn: "Drip / Micro Irrigation (ड्रिप / टपक सिंचाई)", labelHi: "ड्रिप सिंचाई प्रणाली" },
  { id: "sprinkler", labelEn: "Sprinkler System (फव्वारा सिंचाई)", labelHi: "फव्वारा प्रणाली" },
  { id: "rainfed", labelEn: "Rainfed (वर्षा आधारित / बारानी)", labelHi: "वर्षा आधारित" },
];

export const LIVESTOCK_OPTIONS = [
  { id: "cow", labelEn: "Dairy Cow (देसी / साहीवाल गाय)", labelHi: "गाय (Cow)" },
  { id: "buffalo", labelEn: "Buffalo (मुर्रा / देसी भैंस)", labelHi: "भैंस (Buffalo)" },
  { id: "goat", labelEn: "Goats / Sheep (बकरी / भेड़)", labelHi: "बकरी / भेड़" },
  { id: "poultry", labelEn: "Poultry (मुर्गीपालन)", labelHi: "मुर्गीपालन" },
  { id: "none", labelEn: "No Livestock (कोई पशु नहीं)", labelHi: "कोई नहीं" },
];

export const MACHINERY_OPTIONS = [
  { id: "tractor", labelEn: "Tractor 40-50 HP (ट्रैक्टर)", labelHi: "ट्रैक्टर" },
  { id: "rotavator", labelEn: "Rotavator (रोटावेटर)", labelHi: "रोटावेटर" },
  { id: "sprayer", labelEn: "Power / Drone Sprayer (स्प्रेयर)", labelHi: "स्प्रेयर" },
  { id: "seeder", labelEn: "Super Seeder / Drill (सुपर सीडर / ड्रिल)", labelHi: "सुपर सीडर / ड्रिल" },
  { id: "solarpump", labelEn: "Solar Pump (सोलर पंप)", labelHi: "सोलर पंप" },
  { id: "chc_rent", labelEn: "None / Hire from CHC (किराए पर लेते हैं)", labelHi: "किराए पर (CHC)" },
];
