import pytest
from ajrasakha.tools.daily_price.daily_market_price import (
    mandi_price_tool,
    ARRIVAL_AGMARKNET_NOTICE,
)


def test_arrival_quantity_none_notice_and_nearby():
    """Verify arrival actions return the data.gov.in notice when arrival_quantity is None."""
    # 1. get_today_arrival
    res_today = mandi_price_tool(action="get_today_arrival", commodity_name="wheat", state="Haryana")
    assert res_today.get("message") == ARRIVAL_AGMARKNET_NOTICE
    assert res_today.get("resolution", {}).get("arrival_notice") == ARRIVAL_AGMARKNET_NOTICE

    # 2. get_arrival_history
    res_hist = mandi_price_tool(action="get_arrival_history", commodity_name="wheat", state="Haryana", lookback_days=7)
    assert res_hist.get("message") == ARRIVAL_AGMARKNET_NOTICE
    assert res_hist.get("resolution", {}).get("arrival_notice") == ARRIVAL_AGMARKNET_NOTICE

    # 3. get_extreme_arrival
    res_ext = mandi_price_tool(action="get_extreme_arrival", commodity_name="wheat", state="Haryana")
    assert res_ext.get("message") == ARRIVAL_AGMARKNET_NOTICE
    assert res_ext.get("resolution", {}).get("arrival_notice") == ARRIVAL_AGMARKNET_NOTICE


def test_multi_crop_get_price_with_nearby_structure():
    """Verify get_price_with_nearby merges named_market and nearby_markets dictionaries correctly."""
    res = mandi_price_tool(
        action="get_price_with_nearby",
        commodity_name=["wheat", "mustard"],
        market_name="Karnal",
        state="Haryana",
    )

    assert res.get("action") == "get_price_with_nearby"
    assert "named_market" in res
    assert isinstance(res["named_market"], dict)
    assert len(res["named_market"].get("price_records", [])) > 0

    assert "nearby_markets" in res
    assert isinstance(res["nearby_markets"], dict)
    assert len(res["nearby_markets"].get("price_records", [])) > 0

    assert "by_commodity" in res
    assert set(res["by_commodity"].keys()) == {"wheat", "mustard"}
