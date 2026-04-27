# Weather Query Analysis: KCC Farmer Needs to IMD API Mapping

## Overview

Analyze 15.1M weather-related queries from the KCC dataset to identify the most frequent farmer weather needs and map them to relevant IMD API endpoints.
The goal is to prioritize critical IMD data components, define required data fields and freshness, and produce a priority roadmap for phased integration.


### Project Goals

- Identify the most frequent weather-related farmer queries
- Group similar queries using text clustering
- Map queries to relevant IMD (India Meteorological Department) APIs
- Develop a priority roadmap for IMD API integration

> **Impact:** Determines which meteorological data services should be integrated first to support farmers effectively.

## Dataset

**Source:** KCC Master Dataset

| Metric | Value |
|--------|-------|
| **Total queries in dataset** | 43,477,170 |
| **Weather-related queries extracted** | 15,549,889 | (Target=15.1M)

### Data Columns

| Column | Description |
|--------|-------------|
| **StateName** | State where query originated |
| **DistrictName** | District location |
| **BlockName** | Block/tehsil location |
| **Sector** | Agriculture sector |
| **Category** | Crop category |
| **Crop** | Crop mentioned in query |
| **QueryType** | Type of query |
| **QueryText** | Farmer question |
| **KccAns** | Response provided |
| **Year** | Year of query |
| **Month** | Month of query |

**Extraction Criteria:** `QueryType = "Weather Forecast"`
---

## 1. Farmer Query Categorization

All queries were filtered to retain only weather-related queries.

> **Total weather queries identified:** `15,549,889` (Target=15.1M)

**Queries covered:**
- Weather forecasts
- Rainfall predictions
- Current weather conditions
- District-specific weather reports
- Weather impacts on crops

## 2. Analysis Overview (Brief)

Weather-related farmer queries were cleaned and grouped so that similar requirements could be identified consistently across the full dataset. The output was organized into clusters, reviewed manually, and then mapped to the most relevant IMD API categories for reporting and prioritization.

## 3. Clustering

### Approach

Similar farmer queries were grouped together using a text clustering pipeline. At a high level, the process involved four steps:

1. Cleaning and standardizing the raw query text
2. Converting queries into numerical representations using TF-IDF
3. Applying MiniBatch K-Means to group semantically similar queries
4. Manually inspecting each cluster to identify the underlying farmer need

This made it possible to analyze 15.5 million weather queries at scale without reviewing them individually.

The process produced **59 clusters**, each representing a distinct type of weather information request. Clusters with higher query counts reflect the weather topics farmers ask about most often.

**Total queries covered:** 15,549,889 (Target-15.1M) (Around 400k Unique Queries)

---

# Cluster Inspection

Each cluster was manually inspected to understand the query patterns and after that it was labled and merged.

### Example Cluster

**Cluster Example**

```text
weather forecast of block tappal in district aligarh
weather forecast of block atrauli in district aligarh
weather information in district aligarh
```

**Interpretation**

District Weather Forecast

---

# Cluster Distribution by Farmer Need

Clusters were grouped according to the **farmer weather information need** they represent.

---

# General Weather Forecast

| Cluster | Queries | % Coverage | Farmer Need              | Recommended API             | Data Freshness        |
| ------- | ------- | ---------- | ------------------------ | --------------------------- | --------------------- |
| 3       | 6256573 | 40.23%     | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 18      | 3060474 | 19.68%     | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 28      | 1154643 | 7.43%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 27      | 1113802 | 7.16%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 58      | 1091123 | 7.02%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 10      | 559282  | 3.60%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 15      | 240909  | 1.55%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 14      | 98136   | 0.63%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 30      | 68145   | 0.44%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 13      | 37615   | 0.24%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |
| 47      | 25390   | 0.16%      | General Weather Forecast | City Weather 7-Day Forecast | Updated every 6 hours |

**Total Queries (General Weather Forecast clusters): 13,706,092**

---

# District Weather Forecast

| Cluster | Queries | % Coverage | Farmer Need               | Recommended API       | Data Freshness        |
| ------- | ------- | ---------- | ------------------------- | --------------------- | --------------------- |
| 54      | 349023  | 2.24%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 36      | 102497  | 0.66%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 41      | 98205   | 0.63%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 8       | 73673   | 0.47%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 9       | 64584   | 0.42%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 12      | 63738   | 0.41%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 40      | 49767   | 0.32%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 52      | 43465   | 0.28%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 17      | 36092   | 0.23%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 7       | 35614   | 0.23%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 26      | 31027   | 0.20%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 1       | 28883   | 0.19%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 53      | 26387   | 0.17%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 32      | 25943   | 0.17%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 22      | 25095   | 0.16%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 45      | 24712   | 0.16%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 48      | 23498   | 0.15%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 56      | 21940   | 0.14%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 0       | 20614   | 0.13%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 6       | 20192   | 0.13%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 33      | 16390   | 0.11%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 37      | 14970   | 0.10%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 50      | 14767   | 0.09%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 31      | 13905   | 0.09%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 39      | 13282   | 0.09%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 21      | 13258   | 0.09%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 25      | 13236   | 0.09%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 46      | 11814   | 0.08%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 55      | 10766   | 0.07%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 49      | 10703   | 0.07%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 44      | 9085    | 0.06%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 57      | 9018    | 0.06%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 34      | 8898    | 0.06%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 38      | 7755    | 0.05%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 43      | 2685    | 0.02%      | District Weather Forecast | District Forecast API | Updated every 6 hours |
| 16      | 89      | 0.0006%    | District Weather Forecast | District Forecast API | Updated every 6 hours |

**Total Queries (District Weather Forecast clusters): 1,335,570**

---

# Rain Forecast

| Cluster | Queries | % Coverage | Farmer Need   | Recommended API       | Data Freshness        |
| ------- | ------- | ---------- | ------------- | --------------------- | --------------------- |
| 20      | 170137  | 1.09%      | Rain Forecast | Rainfall Forecast API | Updated every 3 hours |
| 2       | 28885   | 0.19%      | Rain Forecast | Rainfall Forecast API | Updated every 3 hours |
| 4       | 27307   | 0.18%      | Rain Forecast | Rainfall Forecast API | Updated every 3 hours |
| 42      | 18640   | 0.12%      | Rain Forecast | Rainfall Forecast API | Updated every 3 hours |
| 19      | 3664    | 0.02%      | Rain Forecast | Rainfall Forecast API | Updated every 3 hours |

**Total Queries (Rain Forecast clusters): 248,633**

---

# Current Weather Condition

| Cluster | Queries | % Coverage | Farmer Need               | Recommended API     | Data Freshness     |
| ------- | ------- | ---------- | ------------------------- | ------------------- | ------------------ |
| 35      | 163029  | 1.05%      | Current Weather Condition | Current Weather API | Real-time / Hourly |
| 29      | 17649   | 0.11%      | Current Weather Condition | Current Weather API | Real-time / Hourly |
| 11      | 177     | 0.001%     | Current Weather Condition | Current Weather API | Real-time / Hourly |

**Total Queries (Current Weather Condition clusters): 180,855**

---

# Short Term Forecast

| Cluster | Queries | % Coverage | Farmer Need         | Recommended API | Data Freshness        |
| ------- | ------- | ---------- | ------------------- | --------------- | --------------------- |
| 24      | 49891   | 0.32%      | Short Term Forecast | Nowcast API     | Updated every 3 hours |
| 23      | 7193    | 0.05%      | Short Term Forecast | Nowcast API     | Updated every 3 hours |

**Total Queries (Short Term Forecast clusters): 57,084**

---

# Weather Impact on Crops

| Cluster | Queries | % Coverage | Farmer Need             | Recommended API      | Data Freshness |
| ------- | ------- | ---------- | ----------------------- | -------------------- | -------------- |
| 5       | 11489   | 0.07%      | Weather Impact on Crops | Agromet Advisory API | Daily Updates  |
| 51      | 10166   | 0.07%      | Weather Impact on Crops | Agromet Advisory API | Daily Updates  |

**Total Queries (Weather Impact on Crops clusters): 21,655**

**Total Across All 59 Clusters: 15,549,889**


This comprehensive dataset shows:
- Each of the 59 query clusters
- The number of farmer queries in each cluster
- The corresponding farmer weather need category
- Query distribution across all farmer needs
- % Coverage of the Farmer Queries

The CSV provides the granular breakdown supporting all of our analysis and conclusions about farmer weather information needs.

---

## 9. Mapping Farmer Needs to IMD APIs

Each farmer need was mapped to relevant **IMD API endpoints**.

> **Total IMD APIs analyzed:** `24 endpoints`

### API-to-Needs Mapping
TOTAL 6 MAJOR API ENDPOINTS

|Priority|Farmer_Need              |Demand_%           |IMD_Data_Component          |Required_Fields                      |Freshness|
|--------|-------------------------|-------------------|----------------------------|-------------------------------------|---------|
|1       |General Weather Forecast |91.380147709769    |Short Range Weather Forecast|temperature, rainfall, humidity, wind|3-hour   |
|2       |District Weather Forecast|4.663044198788842  |District Forecast           |temperature, rainfall                |3-hour   |
|3       |Rain Forecast            |1.921733199082629  |Rainfall Prediction         |rainfall_mm                          |3-hour   |
|4       |Current Weather Condition|1.417383060484597  |Current Weather Observation |temperature, humidity, wind_speed    |hourly   |
|5       |Short Term Forecast      |0.44781265358650596|3-5 Day Forecast            |temperature, rainfall                |6-hour   |
|6       |Weather Impact on Crops  |0.16987917828841334|Agro-Meteorological Advisory|rainfall, storm, hail                |real-time|
                                   |      =100% OVERALL|

---

## Conclusion

This analysis processed over 15.5 million weather-related queries from the KCC dataset to understand what kind of meteorological information farmers across India are actually asking for. By grouping 392,481 unique queries into 59 clusters and mapping them to 6 major farmer need categories, the data gives a clear picture of where demand is concentrated and where API integration effort should be focused first.

The most significant finding is that general weather forecasts account for roughly 91% of all weather queries. Farmers are not, in most cases, asking for highly specific or technical meteorological data. They want to know what the weather will be like, typically at a city or regional level, in the near term. This means that a small number of well-maintained API endpoints can serve the vast majority of farmer requests.

District-level weather forecasts represent the second priority, covering about 4.7% of queries. While this is a much smaller share, it reflects a real need for localized information that general city-level forecasts cannot fully address. Rainfall forecasts, current conditions, and short-term outlooks together make up the remaining ~4%, with crop-impact weather advisories accounting for a very small but operationally valuable segment.

The 6-endpoint API mapping produced from this work provides a practical and data-driven starting point for integration decisions. Rather than attempting to connect every available IMD data feed, agricultural platforms and advisory systems can begin with the two or three highest-priority endpoints and serve the majority of farmer needs from day one, expanding into lower-volume categories as capacity allows.

The broader implication is straightforward: farmers need reliable, accessible weather information delivered in a timely manner. The complexity of the underlying meteorological data is secondary to whether the right information reaches the right person at the right time.
