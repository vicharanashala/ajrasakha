from dataclasses import dataclass
from typing import Optional, List
from datetime import date


@dataclass
class MarketPrice:
    min_price: float
    modal_price: float
    max_price: float
    commodity_arrivals: float
    commodity_traded: float
    created_at: date
    commodity_uom: str


@dataclass
class APMC:
    apmc_id: str
    apmc_name: str


@dataclass
class State:
    state_id: str
    state_name: str