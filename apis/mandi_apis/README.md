# Mandi API

Two paginated endpoints:

- `GET /v1/mandis/nearby?lat=12.97&lng=77.59` — mandis within a radius (default
  40 km, nearest first).
- `GET /v1/mandi/{mandi_id}/prices/nearby` — latest price per crop/variety for
  one mandi.

Plus `GET /health` → `{"status": "ok"}`.

Schema reference: Mandi repo, branch `feat/catalog-v2`, `docs/v2_database_design.md`.

Interactive docs (try the API in the browser): `/docs` (Swagger UI), `/redoc`,
raw spec at `/openapi.json`. A PDF summary is in `Mandi_API.pdf`.

## 1. `GET /v1/mandis/nearby`

| Param | Required | Description |
|---|---|---|
| `lat`, `lng` | yes | Coordinates; lat in [-90, 90], lng in [-180, 180] |
| `search` | no | Mandi name, case-insensitive substring |
| `radius_km` | no | Search radius, >0 and ≤100, default 40 |
| `page` | no | Page number, default 1 |
| `limit` | no | Page size, 1–100, default 20 |

Each item: `id`, `name`, `distance_km`, `updated_time` (newest price date across
the mandi's listings).

    /v1/mandis/nearby?lat=18.52&lng=73.86
    /v1/mandis/nearby?lat=18.52&lng=73.86&search=pune&radius_km=80&limit=10

## 2. `GET /v1/mandi/{mandi_id}/prices/nearby`

| Param | Required | Description |
|---|---|---|
| `mandi_id` | yes | Mandi ObjectId (path) |
| `search` | no | Crop or variety name, case-insensitive substring |
| `sort` | no | `crop` (A–Z, default), `price_high`, `price_low` (by modal price), `newest` |
| `page` | no | Page number, default 1 |
| `limit` | no | Page size, 1–100, default 20 |

Each item: `product_id`, `crop`, `variety`, `unit` (default `Rs/quintal`),
`modal`, `max`, `min`, `price_date`, `age_days`, `stale`.

    /v1/mandi/<mandi_id>/prices/nearby
    /v1/mandi/<mandi_id>/prices/nearby?search=onion&sort=price_high

Both endpoints return `{"data": [...], "pagination": {total, page, limit, total_pages}}`.

## Behaviour
- 400 if `lat`/`lng` out of range, `mandi_id` is not a valid id, or `sort` is invalid;
  404 if the mandi does not exist; 422 if a parameter is missing, malformed or
  out of bounds (`radius_km`, `page`, `limit`); 503 if the database lookup fails.
- `$geoNear` on `available_mandi.location` (index `idx_location_2dsphere`).
- Only `v2_listings` with non-null `product_id` and `mandi_id` are used.
- Latest price per listing comes from `v2_price_records` (`v2_latest_prices` does not exist yet).
- Duplicate mandi+crop+variety across sources: newest date wins.
- `age_days` = today - price_date; `stale` = age_days > `MARKET_STALE_AFTER_DAYS` (default 3).
- Rows with no prices, unparseable or future dates are skipped.

## Configuration
Mongo URI is read from `MONGO_URI`, `MARKET_MONGO_URI` or `MONGODB_URI` (first set wins).
Other env: `MANDI_DB_NAME` (default `Price`), `V2_COLLECTION_PREFIX` (default `v2_`),
`MARKET_STALE_AFTER_DAYS` (3), `MARKET_MONGO_MAX_TIME_MS` (10000), `LOG_LEVEL`, `PORT`.

## Run
    cp .env.example .env   # fill MONGO_URI / MANDI_DB_NAME
    pip install -r requirements.txt
    uvicorn main:app --port 8086
    # or: python main.py   (port 8000, override with PORT)
    # or: docker compose up --build

Then open `http://localhost:<port>/docs`.

## Test
    pytest -q
