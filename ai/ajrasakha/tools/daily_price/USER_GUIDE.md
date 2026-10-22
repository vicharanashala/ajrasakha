# Ajrasakha Daily Market Price Service — System Overview & User Guide

> **Document Type:** Non-Technical Guide & Structural Overview  
> **Audience:** Farmers, Agricultural Stakeholders, Product Teams, and Business Analysts  

---

## 1. System Overview

The **Ajrasakha Daily Market Price Service** is an information system designed to provide transparent, reliable, and timely access to agricultural market prices across India's wholesale markets (mandis / APMCs).

The service allows any agricultural app or AI assistant to answer farmer questions such as:
* *What is the price of tomatoes in my local market today?*
* *Which nearby market is paying the best price for my wheat harvest?*
* *How has the price of onions changed over the last two weeks?*

---

## 2. Where Does the Data Come From? (Data Sources & Websites)

All data used by the system is sourced from verified, official Indian agricultural portals:

```
                           OFFICIAL DATA SOURCES
                                     │
       ┌─────────────────────────────┴─────────────────────────────┐
       ▼                                                           ▼
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│       National Central Portal        │       │      State Agricultural Marketing    │
│              Agmarknet               │       │         Boards & Mandi Portals       │
│        (agmarknet.gov.in)            │       │         (State-Level Portals)        │
└──────────────────┬───────────────────┘       └──────────────────┬───────────────────┘
                   │                                              │
                   └───────────────────────┬──────────────────────┘
                                           │
                                           ▼
                         [ Daily Market Price Feeds ]
```

### 1. National Central Portal: Agmarknet
* **Website:** [agmarknet.gov.in](https://agmarknet.gov.in)
* **Governing Body:** Directorate of Marketing & Inspection (DMI), Ministry of Agriculture & Farmers Welfare, Government of India.
* **What is Collected:** Daily wholesale prices (Min, Max, Modal in ₹/Quintal) from thousands of regulated markets nationwide.

---

### 2. State-Level Agricultural Marketing Portals
* **Description:** State Agricultural Marketing Boards (SAMBs) and state-specific APMC portals providing regional market directories, mandi committee updates, and localized price feeds.

*(State-level websites and portals can be listed here)*

---

## 3. How the Data is Structured

The system organizes agricultural data into four connected layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. COMMODITY DICTIONARY                                                    │
│    Standard crop names + Regional aliases (e.g., Pyaz, Kanda, Onion)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. MANDI / MARKET DIRECTORY                                                 │
│    Market name, State, District, PIN code, and GPS Coordinates (Lat/Long)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. MARKET-COMMODITY LINKS                                                   │
│    Maps which specific mandis trade which crops, varieties, and grades      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. DAILY PRICE RECORDS                                                      │
│    Daily Time-Series: Date, Modal Price, Min Price, Max Price               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Each Data Layer Holds:

| Data Layer | What It Stores | Example |
| :--- | :--- | :--- |
| **Commodity Dictionary** | Canonical crop names and their vernacular translations, local spellings, and dialects. | *Canonical:* `"Onion"`<br>*Aliases:* `"Pyaz"`, `"Kanda"`, `"Dungri"` |
| **Mandi Directory** | Registered APMC markets across India with their physical location, district, state, and GPS coordinates. | *Name:* `"Lasalgaon"`<br>*District:* `"Nashik"`<br>*State:* `"Maharashtra"`<br>*Coordinates:* `[74.22, 20.14]` |
| **Market-Commodity Link** | The association between a market and the specific crop varieties/grades it trades, plus the data source. | *Market:* `"Azadpur"`<br>*Crop:* `"Apple"`<br>*Variety:* `"Delicious"`<br>*Source:* `"Agmarknet"` |
| **Daily Price Records** | Time-stamped daily transaction records. | *Date:* `2025-06-27`<br>*Modal Price:* `₹2,450 / Quintal`<br>*Min:* `₹1,800` \| *Max:* `₹2,800` |

---

## 4. Key Capabilities & Functionalities

The system provides 7 core agricultural market capabilities:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SYSTEM CAPABILITIES                             │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. Today's / Latest Crop Price       │ 5. Lowest / Cheapest Market Price    │
│ 2. Historical Price Trends           │ 6. Nearby Mandi Discovery            │
│ 3. Market Price Summaries            │ 7. Local vs. Nearby Market Compare   │
│ 4. Best / Highest Selling Price      │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 1. Today's / Latest Crop Price
* **What it does:** Fetches the current selling rate for any crop in a specific market or state.
* **Key Information Provided:** Minimum price, Maximum price, and Modal (most common) price in ₹ per Quintal (100 kg).

### 2. Historical Price Trends
* **What it does:** Retrieves day-by-day price movements over any chosen timeframe (e.g. past 7 days, 15 days, or custom date range).
* **Benefit:** Helps farmers and traders determine if market rates are rising, falling, or remaining stable.

### 3. Market Price Summaries & Statistics
* **What it does:** Computes aggregated market metrics across all records in a date window.
* **Key Information Provided:** Average modal price and overall price spread (volatility between lowest and highest rates).

### 4. Best / Highest Selling Price Finder
* **What it does:** Scans markets across a district or state to identify where a crop is fetching the maximum price.
* **Benefit:** Helps farmers maximize revenue by choosing the most profitable market for their produce.

### 5. Lowest / Cheapest Market Price Discovery
* **What it does:** Locates the market selling a commodity at the lowest rate.
* **Benefit:** Useful for buyers, food processors, and livestock farmers sourcing raw commodities or feed at the most economical rate.

### 6. Nearby Mandi Discovery
* **What it does:** Searches the registered market directory to find APMCs located within a specific radius of a user's location or village, sorted by distance.

### 7. Local Mandi vs. Nearby Market Comparison
* **What it does:** Provides a side-by-side comparison between a farmer's local town market price and prices at neighboring mandis within a 100 km radius.
* **Benefit:** Allows farmers to calculate whether the price premium at a neighboring mandi outweighs additional transportation costs.

---

## 5. Smart Features

* **Dialect & Language Tolerance:** Farmers do not need to know official English crop names. The system recognizes regional names and common phonetic spellings.
* **Smart Proximity Ranking:** Calculates true geographical distances from the farmer's location to recommend the nearest markets first.
* **Transparent Weekend & Holiday Handling:** When markets are closed (Sundays, national holidays) or data updates are delayed, the system never returns a blank error. It provides the latest available price with a clear date note (e.g. *"Today's price is not recorded yet. Showing latest available rate from yesterday"*).
* **Multi-Question Efficiency:** Enables agricultural applications to ask for current prices and nearby market comparisons in a single quick exchange.

---

## 6. Glossary of Market Terms

* **Mandi / APMC:** A government-regulated wholesale agricultural market where farmers sell produce to licensed buyers.
* **Quintal:** Standard Indian agricultural weight unit:  
  $$\mathbf{1\text{ Quintal} = 100\text{ Kilograms (kg)} = 0.1\text{ Tonne}}$$
* **Modal Price:** The most common price at which the majority of trades occurred on that day. It is the most realistic estimate of market value.
* **Min & Max Price:** The lowest and highest prices recorded during that day's auctions.
