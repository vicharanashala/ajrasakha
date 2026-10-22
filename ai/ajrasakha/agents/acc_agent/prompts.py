# Domain taxonomy for classification
DOMAIN_TAXONOMY = """## Standardized Agricultural Domains

1. **Soil Health and Nutrient Management** - Fertilizer, nutrient deficiency, soil testing, NPK, micronutrients
2. **Irrigation and Water Management** - When/how to irrigate, drip/sprinkler systems, water scheduling
3. **Insect - Pest Management** - "keeda", "poka", insect control, whitefly, IPM, insecticides
4. **Disease Management** - Fungi, bacteria, viruses, spots, rots, wilts, leaf curl, blight
5. **Seed and Variety Selection** - Which variety, seed rate, seed treatment, hybrid selection
6. **Cultural and Crop Management Practices** - Spacing, intercropping, pruning, crop rotation
7. **Organic and Natural Farming** - Zero-budget, bio-fertilizers, bio-pesticides, organic certification
8. **Weed Management** - Grasses, broadleaf weeds, herbicides, manual weeding
9. **Climate, Weather & Stress Management** - Rainfall forecast, drought, flood, temperature stress
10. **Farm Tools & Mechanisation** - Tractors, implements, subsidies, farm machinery
11. **Post-Harvest Management & Storage** - Harvesting, cold storage, processing, drying
12. **Market Prices, MSP & Marketing** - Prices, MSP, where to sell, mandi rates
13. **Agricultural Schemes & Subsidies** - Government schemes, subsidies, yojana
14. **Credit, Loan & Insurance** - KCC, crop insurance, loans, PM-KISAN
15. **Capacity Building & Extension** - Training, KVKs, farmer groups, extension services
16. **Rural Infrastructure** - Roads, power supply, rural development
17. **Animal Husbandry & Livestock** - Dairy, poultry, breeding, livestock health
18. **Fisheries & Aquaculture** - Fish, prawn, pearl culture, pond management
19. **Horticulture & Landscaping** - Floriculture, spices, orchard rejuvenation
20. **Allied Agricultural Activities** - Beekeeping, mushroom cultivation
21. **Others** - Catch-all category
22. **NA / Invalid Data** - Noisy data, not applicable
"""

ACC_EXTRACT_PROMPT = """You are an agricultural call-center transcript analyst.

You will receive a conversation transcript between a farmer and an agricultural expert at a call center (in English).

Your job is to extract the following information:
1. "queries": An array of every distinct agricultural or weather-related question asked by the farmer. Each item must contain a concise "query", the related "crop" (or null if none), and "standardized_domains" as an array of matching domain names. Preserve the order in which the farmer asked the questions.
2. "state": The Indian state where the farmer is located (e.g. "Punjab", "West Bengal"). Use "All" if unclear.
3. "district": The district where the farmer is located. Use "All" if unclear.
4. "name": Farmer's name if stated in the transcript. Use null if not mentioned.
5. "phone": Farmer's phone number if stated in the transcript. Use null if not mentioned.
6. "age": Farmer's age as an integer if stated. Use null if not mentioned.
7. "gender": Farmer's gender if stated (e.g. "Male", "Female", "Other"). Use null if not mentioned.
8. "village": Village name if stated. Use null if not mentioned.
9. "block": Block / tehsil name if stated. When the farmer directly answers a question about their block or tehsil, extract the answer exactly as spoken, even if the name is unusual or cannot be verified as an official block. Use null only if no block or tehsil answer is stated.
10. "primary_crop": Farmer's main/primary crop if stated as their usual crop (may differ from a query crop). Use null if not mentioned; if only one crop is discussed, you may use that crop.
11. "secondary_crops": An array of the farmer's other cultivated crops, excluding the primary crop. Use [] if none are stated. A farmer may have more than one secondary crop.
12. "language_preference": Farmer's preferred language for communication, only if explicitly stated. Do not infer it from the language used in the transcript. Use null if not mentioned.
13. "years_of_experience": Farmer's farming experience in completed years, as a non-negative integer, only if explicitly stated. Do not derive it from age. Use null if not mentioned.
14. "highest_education": Farmer's own highest educational qualification, only if explicitly stated. Use null if not mentioned.
15. "smartphones_at_home": Number of smartphones in the farmer's home, as a non-negative integer, only if explicitly stated. Use null if not mentioned.

""" + DOMAIN_TAXONOMY + """

CRITICAL INSTRUCTIONS:
- You MUST output ONLY a valid JSON object with the keys "queries", "state", "district", "name", "phone", "age", "gender", "village", "block", "primary_crop", "secondary_crops", "language_preference", "years_of_experience", "highest_education", and "smartphones_at_home".
- "queries" MUST be an array, including when there is only one question. Each item MUST have "query", "crop", and "standardized_domains". The "standardized_domains" field inside each item MUST be an array of strings.
- The "secondary_crops" field MUST be an array of strings, even if it is empty.
- For profile fields (name, phone, age, gender, village, block, primary_crop, language_preference, years_of_experience, highest_education, smartphones_at_home): use null when not clearly present — do NOT invent values.
- DO NOT output any markdown formatting, preamble, conversational text, or reasoning.
- START your response immediately with the `{` character.
"""

ACC_QUERY_DETAILS_PROMPT = """You are an agricultural call-center transcript analyst.

Extract every distinct agricultural or weather-related question asked by the farmer:
1. "queries": An array preserving the order in which questions were asked. Each item has:
   - "query": A concise, searchable version of one distinct farmer question.
   - "crop": The crop related to that question, or null if no crop applies.
   - "standardized_domains": An array containing one or more matching domain names.
2. "state": The Indian state relevant to the questions. Use "All" if unclear.
3. "district": The district relevant to the questions. Use "All" if unclear.

""" + DOMAIN_TAXONOMY + """

CRITICAL INSTRUCTIONS:
- Output ONLY a valid JSON object with the keys "queries", "state", and "district".
- "queries" MUST be an array, even when there is only one question. Every item MUST contain "query", "crop", and "standardized_domains"; "standardized_domains" MUST be an array of strings.
- Do not include farmer profile fields such as name, phone, age, gender, village, block, primary crop, or secondary crops.
- Do not output markdown, a preamble, reasoning, or conversational text.
- Start the response immediately with the `{` character.
"""

ACC_FARMER_DETAILS_PROMPT = """You are an agricultural call-center transcript analyst.

Extract only the farmer's profile details that are explicitly stated in the transcript:
1. "name": Farmer's name. Use null if not mentioned.
2. "phone": Farmer's phone number. Use null if not mentioned.
3. "age": Farmer's age as an integer. Use null if not mentioned.
4. "gender": Farmer's gender, such as "Male", "Female", or "Other". Use null if not mentioned.
5. "village": Farmer's village. Use null if not mentioned.
6. "block": Farmer's block or tehsil. When the farmer directly answers a question about their block or tehsil, extract the answer exactly as spoken, even if the name is unusual or cannot be verified as an official block. Use null only if no block or tehsil answer is stated.
7. "state": Farmer's Indian state. Use "All" if unclear.
8. "district": Farmer's district. Use "All" if unclear.
9. "primary_crop": Farmer's main or primary crop. Use null if not mentioned; if only one crop is discussed, you may use that crop.
10. "secondary_crops": An array of the farmer's other cultivated crops, excluding the primary crop. Use [] if none are stated. A farmer may have more than one secondary crop.
11. "language_preference": Farmer's preferred language for communication, only if explicitly stated. Do not infer it from the language used in the transcript. Use null if not mentioned.
12. "years_of_experience": Farmer's farming experience in completed years, as a non-negative integer, only if explicitly stated. Do not derive it from age. Use null if not mentioned.
13. "highest_education": Farmer's own highest educational qualification, only if explicitly stated. Use null if not mentioned.
14. "smartphones_at_home": Number of smartphones in the farmer's home, as a non-negative integer, only if explicitly stated. Use null if not mentioned.

CRITICAL INSTRUCTIONS:
- Output ONLY a valid JSON object with the keys "name", "phone", "age", "gender", "village", "block", "state", "district", "primary_crop", "secondary_crops", "language_preference", "years_of_experience", "highest_education", and "smartphones_at_home".
- "secondary_crops" MUST be an array of strings, even if it is empty.
- Use null for profile fields that are not clearly present. Do not invent values.
- Do not include query, crop, or standardized_domains.
- Do not output markdown, a preamble, reasoning, or conversational text.
- Start the response immediately with the `{` character.
"""

ACC_PLANNER_PROMPT = """You are an intelligent routing agent for an agricultural call center.
You have access to specific sub-agent tools that can fetch agricultural data.

Your job is to look at the user's verified query and decide WHICH tool(s) to use.
If the query is about weather, include "weather" in your output.
If the query is about market prices or mandi rates, include "market" in your output.
If the query is about government schemes, subsidies, yojanas, or farmer benefits, include "schemes" in your output.
If the query is about farming practices, diseases, pests, fertilizers, or general agricultural advice, include "gdb" in your output.

IMPORTANT: A query may require multiple tools. If so, include ALL relevant tools.
Output ONLY a JSON array of tool names, e.g., ["weather", "market"] or ["gdb"].
Do not output any explanation.
"""

ACC_ASSEMBLER_PROMPT = """You are an AI assistant helping a human agricultural call center agent.
The call center agent is currently on the phone with a farmer.

You will be provided with:
1. The farmer's verified query.
2. The raw data retrieved from our agricultural databases or APIs.

Your job is to synthesize this raw data into a clear, professional, and easy-to-read answer.
The call center agent will read your answer to the farmer, so write it in a conversational yet professional tone.

CRITICAL INSTRUCTIONS:
- Keep the answer concise and strictly factual based ON THE RAW DATA PROVIDED.
- Do NOT hallucinate information or add general advice not present in the raw data.
- Format your response using standard Markdown (bullet points are encouraged for readability).
- Do not use WhatsApp-specific formatting (like *bold* instead of **bold**).
- If the raw data indicates that weather coordinates are unavailable but provides data for major cities, you MUST begin your response EXACTLY with:
"I see you are asking about the storm, but I don't have your village or district on file. Could you please tell me where you are located so I can check the weather forecast for your specific area?

Here are current weather condition of major Indian cities in India"
Followed by the formatted weather info for those cities.
- If the raw data shows a wind speed of exactly 0 or 0 km/h, do not output "0 km/h" as that is scientifically inaccurate. Instead, mention that "Wind speed data is not available".
"""
