"""AjraSakha client — the test transport that hits the actual stack.

The public AjraSakha surface is a WhatsApp webhook; this module wraps
it into a synchronous function the suite can call in a loop.  In CI
we default to :class:`MockAjraSakhaClient` which uses canned, locally
generated multilingual answers — that lets the suite run with no
network and no live API keys.  In staging we use
:class:`RealAjraSakhaClient` which POSTs to the WhatsApp test bot
configured in ``AJRASAKHA_WHATSAPP_TEST_URL``.

Both clients return the same :class:`AjraSakhaResponse` shape so the
rest of the suite is transport-agnostic.
"""
from __future__ import annotations

import abc
import json
import os
import random
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

import urllib.request
import urllib.error


@dataclass
class AjraSakhaResponse:
    """Normalised AjraSakha response used by the evaluators."""

    case_id: str
    scenario_id: str
    domain: str
    language: str
    prompt: str
    response_text: str
    gdb_ids: List[str] = field(default_factory=list)
    latency_ms: int = 0
    ok: bool = True
    error: Optional[str] = None
    metadata: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


class AjraSakhaClient(abc.ABC):
    """Abstract base — both mock and real implement :meth:`ask`."""

    @abc.abstractmethod
    def ask(self, *, case_id: str, scenario_id: str, domain: str,
            language: str, prompt: str) -> AjraSakhaResponse:
        """Submit a localised farmer query and return the response."""


# ---------------------------------------------------------------------------
# Mock implementation — deterministic canned responses for offline runs.
# ---------------------------------------------------------------------------


# Canonical canned answer templates for each (domain, language) pair.
# Templates contain placeholders the mock substitutes; in real life
# AjraSakha generates these end-to-end via the answer-generation LLM.
_TEMPLATE_HINTS: Dict[str, Dict[str, str]] = {
    "weather": {
        "hindi":   "{location} में अगले 3 दिन {forecast}। {crop} की बुवाई के लिए सलाह: {advice}। {disclaimer}",
        "english": "In {location}, next 3 days {forecast}. Advice for {crop}: {advice}. {disclaimer}",
        "kannada": "{location} ನಲ್ಲಿ ಮುಂದಿನ 3 ದಿನ {forecast}. {crop} ಗೆ ಸಲಹೆ: {advice}. {disclaimer}",
        "tamil":   "{location} இல் அடுத்த 3 நாட்ടിൽ {forecast}. {crop} க்கு அறிவுரை: {advice}. {disclaimer}",
        "punjabi": "{location} ਵਿੱਚ ਅਗਲੇ 3 ਦਿਨ {forecast}। {crop} ਲਈ ਸਲਾਹ: {advice}. {disclaimer}",
        "telugu":  "{location} లో వచ్చే 3 రోజులు {forecast}. {crop} కి సలహా: {advice}. {disclaimer}",
    },
    "pest": {
        "hindi":   "{crop} में {pest} के लिए {control} का छिड़काव करें। {disclaimer}",
        "english": "For {pest} on {crop}, spray {control}. {disclaimer}",
        "kannada": "{crop} ಯಲ್ಲಿ {pest} ಗೆ {control} ಸಿಂಪಡಿಸಿ. {disclaimer}",
        "tamil":   "{crop} இல் {pest} க்கு {control} தெளிக்கவும். {disclaimer}",
        "punjabi": "{crop} ਉੱਤੇ {pest} ਲਈ {control} ਛਿੜਕੋ। {disclaimer}",
        "telugu":  "{crop} లో {pest} కి {control} పిచికారీ చేయండి. {disclaimer}",
    },
    "scheme": {
        "hindi":   "{scheme} के बारे में जानकारी: {detail}. पात्रता: {eligibility}. {disclaimer}",
        "english": "{scheme}: {detail}. Eligibility: {eligibility}. {disclaimer}",
        "kannada": "{scheme}: {detail}. ಅರ್ಹತೆ: {eligibility}. {disclaimer}",
        "tamil":   "{scheme}: {detail}. தகுதி: {eligibility}. {disclaimer}",
        "punjabi": "{scheme}: {detail}. ਯੋਗਤਾ: {eligibility}. {disclaimer}",
        "telugu":  "{scheme}: {detail}. అర్హత: {eligibility}. {disclaimer}",
    },
    "soil": {
        "hindi":   "{soil_type} मिट्टी में {crop} के लिए {fertilizer} डालें। {disclaimer}",
        "english": "For {crop} in {soil_type} soil, apply {fertilizer}. {disclaimer}",
        "kannada": "{soil_type} ಮಣ್ಣಿನಲ್ಲಿ {crop} ಗೆ {fertilizer} ಬಳಸಿ. {disclaimer}",
        "tamil":   "{soil_type} மண்ணில் {crop} க்கு {fertilizer} இடவும். {disclaimer}",
        "punjabi": "{soil_type} ਮਿੱਟੀ ਵਿੱਚ {crop} ਲਈ {fertilizer}ਪਾਓ। {disclaimer}",
        "telugu":  "{soil_type} మట్టిలో {crop} కి {fertilizer} వేయండి. {disclaimer}",
    },
    "market": {
        "hindi":   "{mandi} मंडी में {crop} का भाव {price} रुपये प्रति क्विंटल है। {trend}। {disclaimer}",
        "english": "In {mandi} mandi, {crop} is at {price} INR/quintal. {trend}. {disclaimer}",
        "kannada": "{mandi} ಮಂಡಿಯಲ್ಲಿ {crop} ದರ {price} ರೂ. {trend}. {disclaimer}",
        "tamil":   "{mandi} மண்டியில் {crop} விலை {price} ரூபாய். {trend}. {disclaimer}",
        "punjabi": "{mandi} ਮੰਡੀ ਵਿੱਚ {crop} ਦਾ ਭਾਅ {price} ਰੁਪਏ। {trend}. {disclaimer}",
        "telugu":  "{mandi} మార్కెట్‌లో {crop} ధర {price} రూపాయలు. {trend}. {disclaimer}",
    },
}

# Per-domain sample values for the mock generator.
_DOMAIN_VALUES: Dict[str, Dict[str, str]] = {
    "weather": {
        "location": "Ropar",
        "forecast": "20-40 mm rainfall expected",
        "crop": "wheat",
        "advice": "delay sowing by 4-5 days",
    },
    "pest": {
        "pest": "pink bollworm",
        "crop": "cotton",
        "control": "profenofos 50 EC @ 2 ml/litre",
    },
    "scheme": {
        "scheme": "PM-Kisan Samman Nidhi",
        "detail": "Rs. 6000/year direct benefit in three instalments",
        "eligibility": "small & marginal farmers with cultivable land",
    },
    "soil": {
        "soil_type": "clayey",
        "crop": "paddy",
        "fertilizer": "DAP 50 kg + Urea 25 kg per acre",
    },
    "market": {
        "mandi": "Sirsa",
        "crop": "wheat",
        "price": "2275",
        "trend": "Prices expected to rise 5% next month",
    },
}

# Per-language disclaimer (2-hour advice-age caveat).
_DISCLAIMER: Dict[str, str] = {
    "english": "This advice may be up to 2 hours old. Please verify before acting on it.",
    "hindi":   "यह सलाह 2 घंटे पुरानी हो सकती है। कृपया कार्य करने से पहले सत्यापित कर लें।",
    "kannada": "ಈ ಸಲಹೆ 2 ಗಂಟೆಗಳಷ್ಟು ಹಳೆಯದಾಗಿರಬಹುದು. ದಯವಿಟ್ಟು ಕ್ರಿಯಾ ಯೋಜನೆಯ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.",
    "tamil":   "இந்த ஆலோசனை 2 மணி நேரம் பழமையானதாக இருக்கலாம். செயல்படுவதற்கு முன் சரிபார்க்கவும்.",
    "punjabi": "ਇਹ ਸਲਾਹ 2 ਘੰਟੇ ਪੁਰਾਣੀ ਹੋ ਸਕਦੀ ਹੈ। ਕਾਰਵਾਈ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂਚ ਲਓ।",
    "telugu":  "ఈ సలహా 2 గంటల పాతది కావచ్చు. దయచేసి చర్య తీసుకోవడానికి ముందు ధృవీకరించండి.",
}


class MockAjraSakhaClient(AjraSakhaClient):
    """Generate deterministic canned responses for offline / CI runs."""

    def __init__(self, *, seed: int = 42, latency_ms: int = 120):
        self._rng = random.Random(seed)
        self._latency_ms = latency_ms

    def ask(self, *, case_id: str, scenario_id: str, domain: str,
            language: str, prompt: str) -> AjraSakhaResponse:
        start = time.time()
        template = _TEMPLATE_HINTS.get(domain, {}).get(
            language, _TEMPLATE_HINTS["weather"]["english"]
        )
        values = dict(_DOMAIN_VALUES.get(domain, {}))
        # Inject the canonical disclaimer for the response language
        values["disclaimer"] = _DISCLAIMER.get(language, _DISCLAIMER["english"])
        try:
            text = template.format(**values)
        except KeyError:
            # missing placeholder — fall back to raw concatenation
            text = template + " " + " ".join(values.values())

        # Simulate a small per-call latency variation
        time.sleep(0)
        latency = int((time.time() - start) * 1000) + self._latency_ms

        return AjraSakhaResponse(
            case_id=case_id,
            scenario_id=scenario_id,
            domain=domain,
            language=language,
            prompt=prompt,
            response_text=text,
            gdb_ids=[scenario_id],
            latency_ms=latency,
            ok=True,
            metadata={"transport": "mock"},
        )


# ---------------------------------------------------------------------------
# Real implementation — POSTs to the WhatsApp test bot.
# ---------------------------------------------------------------------------


class RealAjraSakhaClient(AjraSakhaClient):
    """Submit prompts to the WhatsApp test bot webhook."""

    def __init__(self, *, base_url: Optional[str] = None,
                 api_key: Optional[str] = None,
                 timeout_s: float = 30.0):
        self.base_url = (
            base_url
            or os.environ.get("AJRASAKHA_WHATSAPP_TEST_URL")
            or "http://localhost:8000/ajrasakha/test/ask"
        )
        self.api_key = api_key or os.environ.get("AJRASAKHA_TEST_API_KEY", "")
        self.timeout_s = timeout_s

    def ask(self, *, case_id: str, scenario_id: str, domain: str,
            language: str, prompt: str) -> AjraSakhaResponse:
        start = time.time()
        body = json.dumps({
            "case_id":     case_id,
            "scenario_id": scenario_id,
            "domain":      domain,
            "language":    language,
            "prompt":      prompt,
        }).encode("utf-8")
        req = urllib.request.Request(
            self.base_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Api-Key":    self.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            latency = int((time.time() - start) * 1000)
            return AjraSakhaResponse(
                case_id=case_id,
                scenario_id=scenario_id,
                domain=domain,
                language=language,
                prompt=prompt,
                response_text=payload.get("response_text", ""),
                gdb_ids=payload.get("gdb_ids", []),
                latency_ms=latency,
                ok=True,
                metadata={"transport": "whatsapp",
                          "status": payload.get("status", "ok")},
            )
        except (urllib.error.URLError, urllib.error.HTTPError,
                json.JSONDecodeError, TimeoutError) as exc:
            latency = int((time.time() - start) * 1000)
            return AjraSakhaResponse(
                case_id=case_id,
                scenario_id=scenario_id,
                domain=domain,
                language=language,
                prompt=prompt,
                response_text="",
                latency_ms=latency,
                ok=False,
                error=str(exc),
                metadata={"transport": "whatsapp"},
            )


def default_client() -> AjraSakhaClient:
    """Return :class:`RealAjraSakhaClient` if env vars are set, else mock."""
    if os.environ.get("AJRASAKHA_USE_REAL_CLIENT", "").lower() in {
        "1", "true", "yes"
    }:
        return RealAjraSakhaClient()
    return MockAjraSakhaClient()