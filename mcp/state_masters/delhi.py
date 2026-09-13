from .base_fetcher import base_fetch_mandi_data

def fetch_mandi_data(state, commodity, district, date):
    """
    Fetches mandi price data for Delhi.
    """
    return base_fetch_mandi_data(state, commodity, district, date)

if __name__ == "__main__":
    # For local testing
    data = fetch_mandi_data("Delhi", "Onion", "Default", "2026-04-30")
    print(data)
