**Weather Station API Documentation**

_Technical integration guide for querying nearest weather station sensors and historical readings_

This document provides technical integration guidelines for querying nearest weather station sensors and retrieving historical sensor readings.

**Base URL:** https://5mqwg03znl.execute-api.us-east-1.amazonaws.com

**Format:** JSON (UTF-8)

# Endpoint 1: Nearest Weather Sensors

Retrieve a list of weather stations located near a specified coordinate, sorted by geodesic distance (ascending).

## Request Definition

**Path:** /nearby/WS\_Nearest\_Sensors

**Method:** GET

**Headers:** Accept: application/json

## Query Parameters

| Parameter | Type | Required | Description | Example |
| --- | --- | --- | --- | --- |
| lat | Float | Yes | Latitude of target location | 30.9712 |
| long | Float | Yes | Longitude of target location | 76.471385 |

## cURL Example

curl -X GET "https://5mqwg03znl.execute-api.us-east-1.amazonaws.com/nearby/WS\_Nearest\_Sensors?lat=30.9712&long=76.471385" \\

\-H "Accept: application/json"

## Response Structure

Returns a JSON object containing a "nearby" array of weather station records.

### Sample JSON Response

{

"nearby": \[

{

"DeviceId": "ANNAM\_CP01",

"Annam\_ID": "ANNAM\_CP01",

"Temperature": 33.46,

"Humidity": 70.48,

"WindSpeed": 2.57,

"WindDirection": 294.0,

"AtmPressure": 969.4,

"Rainfall": 0.0,

"WindGust": 5.11,

"TimeStamp": "2026-08-05 14:10:00",

"State": "Punjab",

"District": "Rupnagar district",

"City": "Rup Nagar tehsil",

"Latitude": 30.971275,

"Longitude": 76.47138500000001,

"DistanceKM": 0.008

}

\]

}

# Endpoint 2: Nearest Sensor History

Retrieve the latest reading of the closest weather station along with its historical readings from the last 7 days from the current date (sorted by time descending).

## Request Definition

**Path:** /history/WS\_Nearest\_Sensors

**Method:** GET

**Headers:** Accept: application/json

## Query Parameters

| Parameter | Type | Required | Description | Example |
| --- | --- | --- | --- | --- |
| lat | Float | Yes | Latitude of target location | 30.9712 |
| long | Float | Yes | Longitude of target location | 76.471385 |

## cURL Example

curl -X GET "https://5mqwg03znl.execute-api.us-east-1.amazonaws.com/history/WS\_Nearest\_Sensors?lat=30.9712&long=76.471385" \\

\-H "Accept: application/json"

## Response Structure

Returns a JSON object containing:

1.  "nearby": An array containing the single closest weather station's latest state.
2.  "history": An array containing the chronological list of past telemetry logs for that station from the last 7 days.

**NOTE:** _Values returned in the "history" array represent raw database records, meaning numeric properties (like Temperature and Humidity) are formatted as JSON strings._

### Sample JSON Response

{

"nearby": \[

{

"DeviceId": "ANNAM\_CP01",

"Annam\_ID": "ANNAM\_CP01",

"Temperature": 33.46,

"Humidity": 70.48,

"WindSpeed": 2.57,

"WindDirection": 294.0,

"AtmPressure": 969.4,

"Rainfall": 0.0,

"WindGust": 5.11,

"TimeStamp": "2026-08-05 14:10:00",

"State": "Punjab",

"District": "Rupnagar district",

"City": "Rup Nagar tehsil",

"Latitude": 30.971275,

"Longitude": 76.47138500000001,

"DistanceKM": 0.008

}

\],

"history": \[

{

"DeviceId": "ANNAM\_CP01",

"Annam\_ID": "ANNAM\_CP01",

"Temperature": "33.46",

"Humidity": "70.48",

"WindSpeed": "2.57",

"WindDirection": "294",

"AtmPressure": "969.40",

"Rainfall": "0.0",

"WindGust": "5.11",

"TimeStamp": "2026-08-05 14:10:00",

"Latitude": "30.971275",

"Longitude": "76.47138500000001"

},

{

"DeviceId": "ANNAM\_CP01",

"Annam\_ID": "ANNAM\_CP01",

"Temperature": "33.28",

"Humidity": "70.08",

"WindSpeed": "1.90",

"WindDirection": "256",

"AtmPressure": "969.20",

"Rainfall": "0.0",

"WindGust": "3.43",

"TimeStamp": "2026-08-05 14:00:00",

"Latitude": "30.971275",

"Longitude": "76.47138500000001"

}

\]

}

# Field Reference Schema

Below is the description of fields returned in the API responses:

| Field Name | Description |
| --- | --- |
| DeviceId | Unique identifier of the weather station. |
| Annam_ID | Alternative/legacy name identifier (if applicable). |
| Temperature | Ambient air temperature (normally in °C). |
| Humidity | Relative humidity percentage (%). |
| WindSpeed | Current wind speed (m/sec). |
| WindDirection | Wind direction in degrees (0° - 360°). |
| AtmPressure | Atmospheric pressure reading. |
| Rainfall | Hourly/daily cumulative rainfall depth (mm). |
| WindGust | Peak wind gust speed. |
| LightIntensity | Light/Solar radiation intensity. |
| TimeStamp | Timestamp of reading formatted as YYYY-MM-DD HH:MM:SS. |
| State | Geographical State name. |
| District | Geographical District name. |
| City | City or Tehsil name. |
| Latitude | Latitude coordinate of the station. |
| Longitude | Longitude coordinate of the station. |
| DistanceKM | Calculated distance from user coordinates (in Kilometers). |