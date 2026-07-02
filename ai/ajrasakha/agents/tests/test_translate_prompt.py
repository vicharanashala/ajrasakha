"""Contract tests: translate_answer prompts transliterate Latin tokens in native script."""

from __future__ import annotations

from ajrasakha.agents.translate_answer import build_translate_system_prompt


def test_native_script_prompt_requires_transliteration():
    prompt = build_translate_system_prompt("Hindi", "Hindi").lower()
    assert "transliterate" in prompt
    assert "ज़िंक" in build_translate_system_prompt("Hindi", "Hindi")
    assert "पीबीडब्ल्यू" in build_translate_system_prompt("Hindi", "Hindi")
    assert "do not omit" in prompt or "do not omit lines" in prompt
    assert "preserve chemical names exactly" not in prompt
    assert "do not leave a–z" in prompt or "do not leave a-z" in prompt


def test_english_script_prompt_allows_latin_codes():
    prompt = build_translate_system_prompt("English", "Hindi")
    assert "Latin alphabet" in prompt
    assert "PBW 872" in prompt or "pbw 872" in prompt.lower()
    assert "transliterate every latin" not in prompt.lower()


def test_shared_rules_preserve_urls_and_content():
    for script, vocal in [("Hindi", "Hindi"), ("English", "English")]:
        prompt = build_translate_system_prompt(script, vocal).lower()
        assert "preserve urls" in prompt
        assert "keep every fact" in prompt


def test_punjabi_native_script_uses_transliteration_branch():
    prompt = build_translate_system_prompt("Punjabi", "Punjabi")
    assert "native writing system" in prompt.lower()
    assert "transliterate" in prompt.lower()
