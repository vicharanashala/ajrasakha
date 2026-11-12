# Mandi API

`GET /v1/prices/nearby?lat=12.97&lng=77.59` — mandis within a fixed 40 km
(nearest first), each with its latest price per approved crop.

Schema reference: Mandi repo, branch `feat/catalog-v2`, `docs/v2_database_design.md`.

## Behaviour
- 400 if `lat` not in [-90, 90] or `lng` not in [-180, 180]; 422 if missing/non-numeric.
- `$geoNear` on `available_mandi.location` (index `idx_location_2dsphere`), maxDistance 40000 m.
- Only `v2_listings` with non-null `product_id` and `mandi_id` are used.
- Latest price per listing comes from `v2_price_records` (`v2_latest_prices` does not exist yet).
- Duplicate mandi+crop+variety across sources: newest date wins.
- `age_days` = today - price_date; `stale` = age_days > `MARKET_STALE_AFTER_DAYS` (default 3).
- Rows with no prices, unparseable or future dates are skipped.

## Run
    cp .env.example .env   # fill MONGO_URI / MANDI_DB_NAME
    pip install -r requirements.txt
    uvicorn main:app --port 8086
    # or: docker compose up --build

## Test
    pytest -q
