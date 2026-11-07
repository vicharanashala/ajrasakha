from datetime import datetime, time, timedelta
from typing import Dict, Any
from app.config import settings

def is_evening_chilling_hours(current_hour: int = None) -> bool:
    """
    Determines if local time falls in the farmer evening relaxation window
    (7:00 PM - 9:00 PM / 19:00 - 21:00)
    """
    if current_hour is None:
        current_hour = datetime.now().hour
    return settings.CHRONO_LEISURE_START_HOUR <= current_hour <= settings.CHRONO_LEISURE_END_HOUR

def calculate_evening_nudge_time(query_time: datetime = None) -> datetime:
    """
    Calculates the target 7:15 PM timestamp for evening re-engagement
    """
    now = query_time or datetime.now()
    target_today = now.replace(hour=19, minute=15, second=0, microsecond=0)
    if now.hour >= 19:
        return target_today + timedelta(days=1)
    return target_today

def format_evening_nudge_message(crop_name: str, language: str = "hi") -> str:
    if language == "hi":
        return (
            f"🌙 *शुभ संध्या किसान भाई!* 🙏\n\n"
            f"आज सुबह अजरासखा ने आपके *{crop_name}* के प्रश्न पर सलाह दी थी।\n"
            f"जब आप आराम कर रहे हों, कृपया बताएं: *क्या वह सलाह आपके काम आई?*\n\n"
            f"👇 नीचे दिए बटन पर केवल 1 टैप करें या 1/2 लिखकर भेजें:"
        )
    elif language == "pa":
        return (
            f"🌙 *ਸ਼ਾਮ ਦੀ ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ ਕਿਸਾਨ ਵੀਰੋ!* 🙏\n\n"
            f"ਅੱਜ ਤੁਹਾਡੇ *{crop_name}* ਲਈ ਦਿੱਤੀ ਗਈ ਸਲਾਹ ਕੀ ਲਾਭਦਾਇਕ ਰਹੀ?\n"
            f"ਕਿਰਪਾ ਕਰਕੇ ਹੇਠਾਂ ਦਿੱਤੇ ਬਟਨ 'ਤੇ ਟੈਪ ਕਰੋ:"
        )
    else:
        return (
            f"🌙 *Good Evening Farmer Friend!* 🙏\n\n"
            f"Regarding the advice given earlier for your *{crop_name}* crop:\n"
            f"Was it helpful to your farming operations?\n\n"
            f"👇 Tap one button below to let us know:"
        )
