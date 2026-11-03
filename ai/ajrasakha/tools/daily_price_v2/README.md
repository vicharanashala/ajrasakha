# Daily price tool — v2

Same MCP tool (`mandi_price_tool`), same actions, inputs and output as `tools/daily_price`, reading the
**v2 database** (`PriceV2`). v1 is not changed.

## What v2 solves

The v1 tool, agent and collections are untouched; v2 runs beside them and is switched on with
`DAILY_PRICE_AGENT_VERSION=v2`.

**Wrong crop prices**
* v1 matched source crop names to crops by guessed aliases. v2 links every source spelling to a
  crop/product only after a person approves it on the review website; a pending name shows no price.
* v1 crop groups mixed different crops. v2 has crops and products (paddy, basmati paddy, rice) and
  answers for exactly one product, so prices never mix.
* Farmer words are a separate, reviewed list, in English only (the planner translates questions first).
* Only a clear one-letter typo is accepted; otherwise the answer is "did you mean …", never a guess.

**Wrong or misleading answers**
* No date fallback: when today's price does not exist, the answer is a message, never an older price.
  "Today" is the date in India (IST), not UTC.
* No mandi fallback: a named mandi with no price gives a message; other mandis are not shown in its place.
* 40 km limit from the farmer's location (was 50 km, and 100 km for nearby mandis); a request cannot raise it.
* Impossible rows (zero, min above max, modal outside min..max) are left out.
* Bad inputs (unknown state such as "Bangladesh", NaN or swapped lat/long, odd dates or day counts) give a
  clear message instead of a crash or a wrong answer.
* A state alone, or the geocoder's state-capital fallback, is not used as the farmer's location.
* Every error has an `error_code` and a message written for farmers; database or connection failures give
  "Mandi prices could not be fetched right now", and Mongo calls time out instead of hanging.
* Answers (agent, `daily_price_v2_formatter`) use ₹ with Indian grouping, readable dates, km per mandi and
  plain lists instead of tables. The plan executor no longer replaces these messages with its generic reply.
* Every price or arrival answer ends with "Last updated: … IST", the time the scraper last saved those prices
  (each row's `ingested_at`; the tool also returns the newest one as `resolution.data_updated_at`).

**Around the tool**
* Scraper v2 (Mandi repo, `feat/catalog-v2`) saves prices exactly as each source names them and adds new
  names as pending for review; listings get `product_id` / `mandi_id` from approved links.
* The Mandi Data Review website (`mandi-review`, branch `v2`) is where experts approve crop names, mandi
  names and farmer words, fix or delete wrong prices (a copy is kept), and see statistics. Every change is
  in its change history.

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
2. an approved **farmer word** (`crop_words`, English only: "dry chillies", "blackgram", "beet root"); a word still pending or rejected stops here
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
TEST_MONGO_URI=mongodb://127.0.0.1:27017 pytest ajrasakha/tools/daily_price_v2/tests   # tool
pytest ajrasakha/agents/tests/test_daily_price_v2.py                                   # agent and answers
```
The tool tests create and drop their own database.

Manual testing by the testing team: [TESTING_SOP.md](TESTING_SOP.md).
