from .base_fetcher import base_fetch_mandi_data

def fetch_mandi_data(state, commodity, district, date):
    """
    Fetches mandi price data for Himachal Pradesh.
    """
    return base_fetch_mandi_data(state, commodity, district, date)

if __name__ == "__main__":
    # For local testing
    data = fetch_mandi_data("Himachal Pradesh", "Apple", "Default", "2026-04-30")
    print(data)
