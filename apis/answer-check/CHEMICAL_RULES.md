# Adding rules for chemicals

The chemical lists are in `data/quality_banned_chemicals.json` and `data/quality_restricted_chemicals.json`.
A plain entry is flagged whenever the answer recommends it. These keys change that.

## Allowed up to a dose

Add `permitted_dose` to an entry in either list:

```json
{ "name": "Xyzphos", "type": "banned", "permitted_dose": { "max": 2, "unit": "ml/L" } }
```

- Up to the dose: not flagged.
- Above the dose: flagged, saying the permitted dose and the dose written in the answer.
- No dose, or a dose that cannot be compared (per acre against per litre): flagged for a reviewer in the banned list, "could not be evaluated" in the restricted list (with `"restriction_kind": "dose_limit"`).
- `unit` is an amount per litre, acre or hectare: `g/L`, `kg/L`, `ml/L`, `L/L`, `g/acre`, `kg/acre`, `ml/acre`, `L/acre`, `g/ha`, `kg/ha`, `ml/ha`, `L/ha`. Amounts are converted, so 800 g/acre is within 1 kg/acre.

## Allowed in one formulation

`"restriction_kind": "formulation_only", "allowed_formulation": "3% CG"` (restricted list; Carbofuran is the example).

## Banned only on some crops

`"restricted_crops": ["Tea"]` (restricted list).

## Other restrictions

`"restriction_kind"` can also be `operator_only`, `seed_treatment_only` or `blanket_ban` (restricted list).

## Government and cooperative brands

Names in `data/quality_authorised_brands.json` (IFFCO so far) are never flagged as private products.
