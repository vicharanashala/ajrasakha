from ajrasakha.evaluation.language_matrix import build_language_quality_matrix


def test_language_quality_matrix_groups_by_language_and_domain():
    rows = build_language_quality_matrix(
        [
            {
                "language": "Hindi",
                "domain": "weather",
                "answer_language_pass": True,
                "disclaimer_language_pass": True,
                "language_switching_pass": True,
                "gdb_entry_pass": True,
                "term_translation_pass": True,
                "language_quality_pass": True,
            },
            {
                "language": "Hindi",
                "domain": "weather",
                "answer_language_pass": False,
                "disclaimer_language_pass": True,
                "language_switching_pass": False,
                "gdb_entry_pass": True,
                "term_translation_pass": True,
                "language_quality_pass": False,
            },
            {
                "language": "Kannada",
                "domain": "market",
                "answer_language_pass": True,
                "disclaimer_language_pass": True,
                "language_switching_pass": True,
                "gdb_entry_pass": True,
                "term_translation_pass": True,
                "language_quality_pass": True,
            },
        ]
    )

    hindi_weather = next(
        row for row in rows
        if row["language"] == "Hindi" and row["domain"] == "weather"
    )
    kannada_market = next(
        row for row in rows
        if row["language"] == "Kannada" and row["domain"] == "market"
    )

    assert hindi_weather["total_cases"] == 2
    assert hindi_weather["answer_language_pass_rate"] == "50.0"
    assert hindi_weather["language_switching_pass_rate"] == "50.0"
    assert hindi_weather["overall_pass_rate"] == "50.0"

    assert kannada_market["total_cases"] == 1
    assert kannada_market["overall_pass_rate"] == "100.0"
