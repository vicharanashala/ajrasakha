"""
Quality Fixtures for AjraSakha Answer Evaluation Pipeline (Project 3).

Unlike questions.py (which tests pipeline ROUTING - did the right
tools/nodes fire), this file tests ANSWER CONTENT - was the text of
the response actually correct.

Each case includes an expert-written reference answer (expected_answer)
and mock retrieved context, so DeepEval metrics have something real to
score against.
"""

QUALITY_TEST_CASES = [
    {
        "name": "weather_quality_1",
        "query": "What is the weather today in Ropar district of Punjab state?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "weather",
        "expected_plan": {"crop": "all", "state": "Punjab"},
        "retrieved_context": [
            "Ropar district, Punjab: Partly cloudy, 28-34°C, light winds, "
            "no rainfall expected in next 24 hours as of latest IMD advisory."
        ],
        "expected_answer": (
            "Today in Ropar district, Punjab, expect partly cloudy skies "
            "with temperatures between 28-34°C. No rainfall is expected "
            "in the next 24 hours."
        ),
    },
    {
        "name": "market_quality_1",
        "query": "What is the current mandi price of wheat in Punjab?",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "expected_domain": "market",
        "expected_plan": {"crop": "wheat", "state": "Punjab"},
        "retrieved_context": [
            "Ludhiana mandi, Punjab: Wheat (Gehun) MSP-linked rate "
            "₹2,275 per quintal as per latest APMC bulletin."
        ],
        "expected_answer": (
            "The current mandi price for wheat in Ludhiana, Punjab is "
            "approximately ₹2,275 per quintal, based on the latest APMC "
            "bulletin."
        ),
    },
    {
        "name": "soil_quality_1",
        "query": "My soil has low nitrogen, what should I do for my paddy crop?",
        "location": {"city": "Amritsar", "state": "Punjab"},
        "expected_domain": "soil",
        "expected_plan": {"crop": "paddy", "state": "Punjab"},
        "retrieved_context": [
            "For nitrogen-deficient soils growing paddy: apply Urea in "
            "split doses - 1/3 at transplanting, 1/3 at tillering, 1/3 "
            "at panicle initiation, as per PAU package of practices."
        ],
        "expected_answer": (
            "For nitrogen-deficient soil under paddy, apply urea in three "
            "split doses: one-third at transplanting, one-third at "
            "tillering stage, and one-third at panicle initiation, as "
            "recommended by PAU."
        ),
    },
    {
        "name": "schemes_quality_1",
        "query": "What government schemes are available for small farmers in Punjab?",
        "location": {"city": "Patiala", "state": "Punjab"},
        "expected_domain": "schemes",
        "expected_plan": {"crop": "all", "state": "Punjab"},
        "retrieved_context": [
            "PM-KISAN provides ₹6,000/year in three installments to "
            "eligible small and marginal farmer families across India, "
            "including Punjab."
        ],
        "expected_answer": (
            "Small farmers in Punjab can benefit from PM-KISAN, which "
            "provides ₹6,000 per year in three equal installments to "
            "eligible small and marginal farmer families."
        ),
    },
    {
        "name": "gdb_query_quality_1",
        "query": "What is the recommended pesticide for whitefly in cotton?",
        "location": {"city": "Bathinda", "state": "Punjab"},
        "expected_domain": "GDB queries",
        "expected_plan": {"crop": "cotton", "state": "Punjab"},
        "retrieved_context": [
            "Golden Dataset entry: For whitefly management in cotton, "
            "apply Diafenthiuron 50% WP @ 400g/acre or Flonicamid 50% WG "
            "@ 80g/acre. Avoid banned chemicals like Monocrotophos."
        ],
        "expected_answer": (
            "For whitefly control in cotton, apply Diafenthiuron 50% WP "
            "at 400g per acre, or Flonicamid 50% WG at 80g per acre. Do "
            "not use banned chemicals such as Monocrotophos."
        ),
    },
    {
        "name": "greeting_quality_1",
        "query": "Hello, how are you?",
        "location": {"city": "all", "state": "all"},
        "expected_domain": "greetings",
        "expected_plan": {"crop": "all", "state": "all"},
        "retrieved_context": [],
        "expected_answer": (
            "Hello! I'm doing well, thank you. How can I help you with "
            "your farming questions today?"
        ),
    },
]
