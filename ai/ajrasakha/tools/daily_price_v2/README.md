# Daily price tool — v2

Same MCP tool (`mandi_price_tool`), same actions, inputs and output as `tools/daily_price`, reading the
**v2 database** (`PriceV2`). v1 is not changed.

## What is different from v1

| | v1 (`tools/daily_price`) | v2 (this folder) |
| --- | --- | --- |
| Database | `Price` | `PriceV2`, or `Price` with `v2_`-prefixed collections (`MARKET_V2_COLLECTION_PREFIX=v2_`); built by the scraper's `maintenance/migrate_v2.py` |
| Crop → listings | `commodity_alias_lookup` group (guessed aliases) → `markets_commodities.commodity_alias_lookup_id` | product → `listings.product_id`, from person-approved links only |
| Resolving the farmer's crop | alias, regex and compatibility rules | exact: product name, crop name (its default product), or an approved mandi spelling in `crop_names` |
| Name filters after the query | `_filter_mc_by_commodity_preference`, `_name_matches_request` | none: one product is one meaning |
| State spellings | `_STATE_SYNONYMS` table in code | `states` collection (`spellings`), with the old table as a fallback |
| Mandis | `available_mandi`, joined by `market_id` | `available_mandi` (unchanged), joined by `listings.mandi_id` |

## How the farmer's crop word is matched

In memory (refreshed every 5 minutes), first hit wins:

1. a product or crop name (a crop gives its default product)
2. an approved **farmer word** (`crop_words`: "dhan", "धान", "jhona", "basmati"); a word still pending or rejected stops here
3. an approved source spelling (`crop_names`)
4. a clear typo: one wrong letter (two for 16+ letters) from a name or farmer word, and no other crop equally close

Words are compared by a key that ignores order, case and punctuation ("Ginger (Dry)" = "dry ginger") and keeps
Indian-script vowel signs together. When nothing matches, the answer carries `reason: "crop_not_recognised"` and
`did_you_mean` suggestions; a known crop with no listings in the state gives `reason: "no_listings_in_state"`.

A crop name that is still **pending** review returns `COMMODITY_NOT_AVAILABLE` rather than a guessed price.

## No fallback, 40 km

* Only the asked day or period is answered. When today's price (or the asked date's) does not exist,
  the answer is a message such as "Onion price today is not available at Karnal APMC." An older price
  is never shown instead. "Today" is the date in India (IST).
* A named mandi without a price gives that message; other mandis are not shown in its place. When it
  has a price, `get_price_with_nearby` also lists other mandis near it.
* With the farmer's location, only mandis within 40 km are used (`MARKET_DEFAULT_MAX_RADIUS_KM`); a larger
  `radius_km` is capped. Without a location the whole state is used.
* Rows that cannot be right (zero prices, min above max, modal outside min..max) are left out.
* Every error has an `error_code` and a message written for farmers; the agent shows it as is.

## Run

```bash
cp ../daily_price/.env .env   # then set MARKET_MONGO_DB_NAME=Price and MARKET_V2_COLLECTION_PREFIX=v2_
                              # (or MARKET_MONGO_DB_NAME=PriceV2 if v2 has its own database)
docker compose up --build -d                      # MCP on port 8114
```

The agent uses it when `DAILY_PRICE_AGENT_VERSION=v2` is set for the main app (default is v1).

## Tests

```bash
TEST_MONGO_URI=mongodb://127.0.0.1:27017 pytest ajrasakha/tools/daily_price_v2/tests
```
They create and drop their own database.
