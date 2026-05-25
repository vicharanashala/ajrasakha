"""Language detection and output matching."""

from ajrasakha.agents.language import (
    detect_farmer_language,
    language_directive_for_synthesis,
    text_matches_user_language,
    detect_script,
)


def test_detect_english_query():
    assert detect_farmer_language("How can I grow paddy in punjab?") == "English"


def test_detect_hindi_query():
    assert detect_farmer_language("पंजाब में धान कैसे उगाएं?") == "Hindi"


def test_detect_hinglish_query():
    # Hindi language written in Latin script
    assert detect_farmer_language("Mera sawal gehu ke baare me hai.") == "Hinglish"


def test_detect_romanized_punjabi_query():
    # Punjabi language written in Latin script
    assert detect_farmer_language("Mainu daso kanak kive ugaiye.") == "Romanized Punjabi"


def test_english_directive_forbids_hindi_output():
    d = language_directive_for_synthesis("English")
    assert "English" in d
    assert "translate" in d.lower()


def test_hinglish_directive_enforces_latin_script():
    d = language_directive_for_synthesis("Hinglish")
    assert "Hinglish" in d or "Hindi in Latin Script" in d
    assert "Do NOT use Devanagari script" in d


def test_reviewer_hindi_answer_english_user_not_matching():
    # User in English (Latin), Answer in Hindi (Devanagari) -> should not match
    assert text_matches_user_language(
        "पंजाब में धान की खेती",
        "How can I grow paddy in punjab?",
    ) is False


def test_reviewer_english_answer_english_user_matching():
    # User in English (Latin), Answer in English (Latin) -> should match
    assert text_matches_user_language(
        "Grow paddy using PR 133 variety.",
        "How can I grow paddy in punjab?",
    ) is True


def test_reviewer_hindi_answer_hinglish_user_not_matching():
    # User in Hinglish (Latin), Answer in Devanagari (Hindi) -> should NOT match (requires translation to Hinglish)
    assert text_matches_user_language(
        "पंजाब में धान की खेती",
        "Paddy ki kheti kive kariye?",
    ) is False


def test_reviewer_hinglish_answer_hinglish_user_matching():
    # User in Hinglish (Latin), Answer in Hinglish (Latin) -> should match
    assert text_matches_user_language(
        "Paddy ki kheti aese karein.",
        "Paddy ki kheti kive kariye?",
    ) is True


def test_localized_disclaimers():
    from ajrasakha.agents.language import (
        get_localized_warning_text,
        get_localized_empty_reply_body,
        get_localized_sources_header,
        get_localized_source_prefix,
        get_localized_expert_prefix,
    )
    
    # English
    assert "Important Notice" in get_localized_warning_text("English")
    assert "shared with our agri expert" in get_localized_empty_reply_body("English")
    assert "sourced only from" in get_localized_sources_header("English")
    assert get_localized_source_prefix("English") == "📚 Source:"
    assert get_localized_expert_prefix("English") == "👨‍🌾 Agri Expert:"

    # Hinglish
    assert "under development hai aur sirf testing" in get_localized_warning_text("Hinglish")
    assert "Aapka sawal annam.ai par hamare agri expert" in get_localized_empty_reply_body("Hinglish")
    assert "niche diye gaye approved materials" in get_localized_sources_header("Hinglish")
    assert get_localized_source_prefix("Hinglish") == "📚 Source:"

    # Hindi
    assert "महत्वपूर्ण सूचना" in get_localized_warning_text("Hindi")
    assert "कृषि विशेषज्ञ के साथ साझा" in get_localized_empty_reply_body("Hindi")
    assert "निम्नलिखित स्वीकृत सामग्री" in get_localized_sources_header("Hindi")
    assert get_localized_source_prefix("Hindi") == "📚 स्रोत:"
    assert get_localized_expert_prefix("Hindi") == "👨‍🌾 कृषि विशेषज्ञ:"

    # Punjabi
    assert "ਖਾਸ ਨੋਟਿਸ" in get_localized_warning_text("Punjabi")
    assert "ਖੇਤੀਬਾੜੀ ਮਾਹਰ ਨਾਲ ਸਾਂਝਾ" in get_localized_empty_reply_body("Punjabi")
    assert "ਹੇਠ ਲਿਖੀਆਂ ਪ੍ਰਵਾਨਿਤ" in get_localized_sources_header("Punjabi")
    assert get_localized_source_prefix("Punjabi") == "📚 ਸਰੋਤ:"
    assert get_localized_expert_prefix("Punjabi") == "👨‍🌾 ਖੇਤੀਬਾੜੀ ਮਾਹਰ:"


async def test_async_language_detection():
    from ajrasakha.agents.language import adetect_farmer_language
    # Run simple checks that shouldn't require complex script detection logic first
    assert await adetect_farmer_language("How can I grow paddy in punjab?") == "English"
    # Testing Hinglish with direct invoke
    assert await adetect_farmer_language("Mera sawal gehu ke baare me hai.") == "Hinglish"


def test_localized_follow_up_questions():
    from ajrasakha.agents.language import (
        get_localized_state_question,
        get_localized_crop_question,
    )
    # English
    assert get_localized_state_question("English") == "Which state are you in?"
    assert get_localized_crop_question("English") == "Which crop are you growing?"

    # Hinglish
    assert get_localized_state_question("Hinglish") == "Aap kis state se hain?"
    assert get_localized_crop_question("Hinglish") == "Aap kaunsi fasal uga rahe hain?"

    # Hindi
    assert get_localized_state_question("Hindi") == "आप किस राज्य से हैं?"
    assert get_localized_crop_question("Hindi") == "आप कौन सी फसल उगा रहे हैं?"

    # Punjabi
    assert get_localized_state_question("Punjabi") == "ਤੁਸੀਂ ਕਿਸ ਰਾਜ ਤੋਂ ਹੋ?"
    assert get_localized_crop_question("Punjabi") == "ਤੁਸੀਂ ਕਿਹੜੀ ਫਸਲ ਉਗਾ ਰਹੇ ਹੋ?"


