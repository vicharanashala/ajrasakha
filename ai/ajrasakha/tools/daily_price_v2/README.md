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

A crop name that is still **pending** review returns `COMMODITY_NOT_AVAILABLE` rather than a guessed price.

## Run

```bash
cp ../daily_price/.env .env   # then set MARKET_MONGO_DB_NAME=Price and MARKET_V2_COLLECTION_PREFIX=v2_
                              # (or MARKET_MONGO_DB_NAME=PriceV2 if v2 has its own database)
docker compose up --build -d                      # MCP on port 8112
```

The agent uses it when `DAILY_PRICE_AGENT_VERSION=v2` is set for the main app (default is v1).

## Tests

```bash
TEST_MONGO_URI=mongodb://127.0.0.1:27017 pytest ajrasakha/tools/daily_price_v2/tests
```
They create and drop their own database.
