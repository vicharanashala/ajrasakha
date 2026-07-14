export const DISTRICT_RENAMES: Record<string, string> = {
  // Jammu & Kashmir
  Baramula: "Baramulla",
  "Ladakh (Leh)": "Leh",

  // Uttarakhand
  "Naini Tal": "Nainital",
  "Dehra Dun": "Dehradun",

  // Karnataka
  Belgaum: "Belagavi",
  Mysore: "Mysuru",
  Tumkur: "Tumakuru",
  Bagalkot: "Bagalkote",
  Chikmagalur: "Chikkamagaluru",
  Chamrajnagar: "Chamarajanagara",

  // Andhra Pradesh
  Vishakhapatnam: "Visakhapatnam",
  Anantapur: "Ananthapuramu",

  // Tamil Nadu
  Tiruchchirappalli: "Tiruchirappalli",
  Villupuram: "Viluppuram",

  // Maharashtra
  Aurangabad: "Chhatrapati Sambhajinagar",
  Gondiya: "Gondia",

  // Odisha
  Keonjhar: "Kendujhar",

  //   Rajasthan
  Chittaurgarh: "Chittorgarh",

  // Uttar Pradesh
  Kanpur: "Kanpur Nagar",

  // Punjab
  "Nawan Shehar": "Nawanshahr"
};

export const STATE_RENAMES: Record<string, string> = {
  Orissa: "Odisha",
  Uttaranchal: "Uttarakhand",
  "Jammu and Kashmir": "Jammu And Kashmir",
};

export const DISTRICT_STATE_OVERRIDES: Record<string, string> = {
  Kargil: "Ladakh",
  Leh: "Ladakh",
  "Ladakh (Leh)": "Ladakh",
};
