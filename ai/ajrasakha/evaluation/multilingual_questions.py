MULTILINGUAL_TEST_CASES = [
    {
        "name": "gdb_question_1_hindi",
        "query": "पंजाब में धान की खेती कैसे करें?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "Cultural Practices",
        "stable": True,
        "expected_nodes": [
            "planner",
            "execute_plan",
            "retrieval_sanitizer",
            "assemble_answer_body",
            "translate_answer",
        ],
        "expected_tools": [
            "upload_question_to_reviewer_system",
            "gdb",
        ],
        "expected_plan": {
            "knowledge_base": True,
            "state": "Punjab",
            "crop": "Paddy",
            "script_language": "Hindi",
            "vocal_language": "Hindi",
            "is_complete": True,
        },
    }
]