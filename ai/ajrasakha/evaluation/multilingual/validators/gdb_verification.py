from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase

def validate_gdb_retrieval(result: dict, case: MultilingualCase) -> dict:
    # 1. Handle no-match scenario
    if case.expected_gdb_no_match:
        trace = result.get("trace", {})
        observed_id = trace.get("gdb_entry_id") or trace.get("chosen_question_id")
        
        if observed_id:
            return {
                "gdb_retrieval_status": "FAIL",
                "gdb_retrieval_reason": f"Expected no GDB result, but got ID '{observed_id}'"
            }
        return {
            "gdb_retrieval_status": "PASS",
            "gdb_retrieval_reason": ""
        }

    # 2. Check configuration
    expected_id = case.expected_gdb_id
    if not expected_id:
        return {
            "gdb_retrieval_status": "BLOCKED",
            "gdb_retrieval_reason": "Live GDB fingerprint verification is blocked pending real IDs."
        }

    # 3. Extract and match
    trace = result.get("trace", {})
    observed_id = trace.get("gdb_entry_id") or trace.get("chosen_question_id")
    
    if observed_id == expected_id:
        return {
            "gdb_retrieval_status": "PASS",
            "gdb_retrieval_reason": ""
        }
        
    if not observed_id:
        return {
            "gdb_retrieval_status": "FAIL",
            "gdb_retrieval_reason": f"Expected GDB ID '{expected_id}', but trace had no fingerprint."
        }
        
    return {
        "gdb_retrieval_status": "FAIL",
        "gdb_retrieval_reason": f"Expected GDB ID '{expected_id}', got '{observed_id}'"
    }
