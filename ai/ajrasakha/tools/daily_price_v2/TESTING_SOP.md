# Testing SOP: Mandi price answers (v2)

As of 2 Nov 2026. Live copy for comments: https://claude.ai/artifact/EhbSNfrHzj7V49SRc4cw22

## Purpose and scope

This SOP checks that the new (v2) mandi price answers follow four rules. Each rule has test cases below; a single break of any rule is a Critical bug.

1. **Today means today.** If today's price does not exist, the farmer gets only a message. An older price is never shown instead.
2. **Only the asked mandi.** If a named mandi has no price, the farmer gets only a message. Other mandis are never shown instead.
3. **40 km limit.** When the farmer's location is known, only mandis within 40 km are used.
4. **Plain answers.** Prices in ₹ per quintal, readable dates, distance in km, and no technical text in any message.

In scope: mandi price, price history, average, highest and lowest price, arrivals and "mandis near me" questions in the AjraSakha chat. Out of scope: weather, schemes and the old (v1) mandi tool.

## Before you start

Test only on a server the developers have confirmed is running the v2 mandi agent and tool. Ask them to confirm these three things before each test round:

- The chat server has `DAILY_PRICE_AGENT_VERSION=v2`.
- The v2 price tool (port 8114) is built from branch `fix/weather_answer_showing_bangladesh`, commit `6c49b17d0` or later.
- The scraper ran today, and at what time (IST).

### Test profiles

Create these accounts once and keep their profile location fixed. The location in the profile is what the answers use.

| Profile | State | District | Location in profile | Used for |
| --- | --- | --- | --- | --- |
| A | Haryana | Karnal | Yes (Karnal town) | Most cases; many mandis within 40 km |
| B | Uttar Pradesh | Lucknow | Yes (Lucknow city) | A second state with its own price source |
| C | Haryana | (empty) | No | State-wide answers with no distance |
| D | Rajasthan | Jaisalmer | Yes (Jaisalmer town) | Few mandis within 40 km |
| E | (empty) | (empty) | No | Missing location |

### Finding the right answer

Every result must be checked against the data, not against what looks reasonable.

- Open the **Mandi Data Review** site (ask the developers for a viewer login).
- **Statistics** shows how many prices were saved today. If it shows 0 for today, every "today" question must get a "not available" message.
- **All data → v2_price_records** lists each saved price with its date. Use it to see whether a crop has a price today at a given mandi.
- **Mandis** lists each mandi with its district and location, for checking distances.
- For a quick outside check, [Agmarknet](https://agmarknet.gov.in) shows the same mandi prices; small timing differences are normal.

## How to run each test

Run every case in a new chat, so an earlier question cannot change the answer.

1. Log in with the profile named in the case.
2. Before asking, look up the right answer on the Mandi Data Review site (crop, mandi, date). Write down what you expect.
3. Type the question exactly as written in the case. Note the time in IST.
4. Copy the full answer text and take a screenshot.
5. Compare the answer with the expected result and with the message checklist in "Errors and message quality".
6. Mark the case Pass or Fail in the results sheet. For a Fail, raise a bug (last section).
7. Repeat the cases marked **(Hindi)** in Hindi once all English cases pass.

Timing matters. Prices for today usually appear after the day's scrape (ask the developers for its time). Run the "today" cases twice: once in the morning before the scrape, and once after it.

### Results sheet

Keep one row per run in this format.

| Case ID | Profile | Date and time (IST) | Language | Expected | Actual (short) | Result | Bug link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TP-01 | A | 3 Nov 2026, 15:10 | English | Onion today, Karnal area, ≤ 40 km | 4 mandis, today, all ≤ 25 km | Pass | |

### Test case IDs

Each ID is the test group (letters) and the case number in that group (digits). "(Hindi)" after an ID means the case is also run in Hindi once the English cases pass.

| Prefix | Group | Section |
| --- | --- | --- |
| TP | Today's price | Today's price and no fallback |
| LC | Location | Location and the 40 km limit |
| NM | Named mandi | Named mandi and district |
| CR | Crop | Crops, dates and other questions |
| DT | Date | Crops, dates and other questions |
| OT | Other question types (forecast, MSP, comparison) | Crops, dates and other questions |
| ER | Error | Errors and message quality |

A mandi or crop named in a case is an example. Before running it, check on the review site that it still fits the case on the day you test (for NM-02: no price today at that mandi, while a nearby mandi has one), and swap in another if not.

## Test cases: today's price and no fallback

The answer must only ever show prices dated on the day or period asked. Any older date shown for a "today" question is a Critical bug.

| ID | Profile | Ask | Expected result |
| --- | --- | --- | --- |
| TP-01 (Hindi) | A | What is the onion price today? | Heading says "today" with today's date. Mandis nearest first, each with "km away" and ₹ per quintal. Ends with the price note and "Source: …". |
| TP-02 | A | Pick a crop with no price today (check the review site), e.g. "paddy price today" | Only a message: "Paddy price today is not available in mandis within 40 km of your location." No prices, no other date. |
| TP-03 | A | Onion price today, asked in the morning before the scrape | Only the "not available" message. Yesterday's price must not appear. |
| TP-04 | A | Onion price yesterday | Only yesterday's prices; heading says "yesterday" with the date. |
| TP-05 | A | Onion price on 1 November 2026 (a day with data) | Only prices dated 1 Nov 2026. |
| TP-06 | A | Paddy price on a day with no paddy data | Only a message naming that date, e.g. "… for 29 Oct 2026 is not available …". |
| TP-07 | A | Onion price in the last 7 days | Every line dated within the last 7 days, newest first. At most 10 lines, then "…and N more price records." |
| TP-08 | A | Onion price today, asked between 12:00 and 5:30 am IST | "Today" is the new date in India. Prices from the previous day must not be called today's. |
| TP-09 | A | Highest onion price this week | One line: price, mandi, km and date, all inside the last 7 days. |
| TP-10 | A | Onion arrival today | Arrival in tonnes per mandi for today only, or "Arrival quantity for onion is not reported by these mandis …". |

## Test cases: location and the 40 km limit

With a location in the profile, no mandi farther than 40 km may appear, whatever the farmer asks. Check every "km away" figure in the answer.

| ID | Profile | Ask | Expected result |
| --- | --- | --- | --- |
| LC-01 | A | Onion price in nearby mandis | Every mandi shows "km away" and none is above 40. Nearest first. |
| LC-02 | A | Onion price in mandis within 100 km | Still no mandi above 40 km. |
| LC-03 (Hindi) | A | Which mandis are near me? | "Mandis near you:" list, nearest first, each with district and km, all 40 km or less. |
| LC-04 | D | Onion price today | If no mandi within 40 km has onion today: only the "not available in mandis within 40 km of your location" message. No far-away mandi. |
| LC-05 | D | Which mandis are near me? | Either mandis within 40 km, or "No mandi was found within 40 km of your location." |
| LC-06 | C | Onion price today | Answer for the whole state: heading says "in Haryana mandis". No "km away" (location is unknown). |
| LC-07 | B | Potato price today | Only Uttar Pradesh mandis within 40 km of Lucknow. |
| LC-08 | E | Onion price today | Asks the farmer to set their state and district in the profile. No prices. |
| LC-09 | Profile with state set to "Bangladesh" (or another country) | Onion price today | "Mandi prices are available only for Indian states and union territories …" No prices. |

## Test cases: named mandi and district

When the farmer names a mandi with no price for the asked day, the answer is only a message. Showing another mandi's price in its place is a Critical bug.

| ID | Profile | Ask | Expected result |
| --- | --- | --- | --- |
| NM-01 (Hindi) | A | Onion price in Karnal mandi (a mandi with today's price) | Karnal's price first. Below it, "other mandis nearby" with at most 3 mandis, none above 40 km and Karnal not repeated. |
| NM-02 | A | Named mandi in the farmer's district that has no price today for the crop (check the review site), e.g. "Basmati paddy price in Tarori mandi" | Only a message: "… price today is not available at Tarori APMC." No other mandi, not even a nearby one. |
| NM-03 | A | Onion price in Karnaal mandi (spelling slip) | Price for Karnal, with a line saying the closest matching mandi is shown. |
| NM-04 | A | Onion price in Zzzpur mandi | "I could not find a mandi called 'Zzzpur' in Haryana." No prices. |
| NM-05 | C | Onion price in a district name that no mandi is called, e.g. "Kurukshetra" | Prices from that district's mandis, with a line saying so; or, if none has a price, "… not available in mandis in Kurukshetra district." |
| NM-06 | A | Onion price in Hisar mandi (another district) | Message that the farmer can only see mandis in their own district, and how to change the profile. No prices. |
| NM-07 | A | Compare onion price in Karnal and Panipat mandi | Polite message that only one mandi can be shown at a time, with example questions. No prices. |

## Test cases: crops, dates and other questions

A crop the system does not clearly recognise must get a question back, never a guessed price.

| ID | Profile | Ask | Expected result |
| --- | --- | --- | --- |
| CR-01 (Hindi) | A | प्याज का भाव क्या है? | Onion price, same as TP-01. |
| CR-02 | A | Onionn price today (one extra letter) | Onion price. |
| CR-03 | A | Xyzabc price today | "I could not find a crop called 'Xyzabc'." with "Did you mean …?" or a request to check the name. No prices. |
| CR-04 | A | Rice price today (rice still waits for expert review) | "Could not find a crop" message. Paddy prices must not be shown for rice. |
| CR-05 | A | Sweet potato price this week | Only sweet potato prices. |
| CR-06 | A | Onion and potato price today | One block per crop. A crop with no price today gets a "Note: … not available" line; the other still shows. |
| CR-07 | A | Average onion price last 7 days | Summary: average, lowest and highest price per quintal, the period with dates, number of records. |
| CR-08 | A | Lowest wheat price last week | One line with price, mandi, km and date; or the "not available" message. |
| DT-01 | A | Onion price on 32 October | "I could not understand the date …" message. No prices. |
| DT-02 | A | Onion price from 1 Nov to 28 Oct (dates reversed) | Prices from 28 Oct to 1 Nov; no error. |
| DT-03 | A | Onion price on 25 December (no year, asked before Christmas) | Answer is for 25 Dec of last year, not a future date. |
| OT-01 | A | What will onion price be tomorrow? | Polite message that future prices cannot be predicted. No prices. |
| OT-02 | A | What is the MSP of wheat? | Message that MSP is not available here. No prices. |
| OT-03 | A | Has onion price gone up since last week? | Message that only one period at a time can be shown. |

## Test cases: errors and message quality

Apply this checklist to every answer in every case above, not only the cases in this section.

- [ ] Prices are in ₹ with commas (₹2,320; ₹1,23,456) and say "per quintal".
- [ ] Dates read as "today (2 Nov 2026)", "yesterday (1 Nov 2026)" or "28 Oct 2026", never 2026-11-02.
- [ ] Every mandi in a near-you answer shows "km away".
- [ ] No tables, no `|` characters, no `[ ]` or `{ }`.
- [ ] No technical words: None, null, error, exception, Traceback, markets_commodities, crop=, state=, ObjectId, Mongo, HTTP.
- [ ] A "not available" answer names the crop, the day and the place, and shows no price at all.
- [ ] An answer with prices ends with the price note and a "Source: …" line; a message without prices has neither.
- [ ] In Hindi, the whole answer is translated and the numbers match the English answer.

| ID | Setup (by developers) | Ask | Expected result |
| --- | --- | --- | --- |
| ER-01 | Stop the v2 price tool for a few minutes | Onion price today (profile A) | "Mandi prices could not be fetched right now. Please try again in a few minutes." Nothing technical. |
| ER-02 | Stop the price database connection | Onion price today (profile A) | Same message as ER-01, within about 10 seconds; the chat must not hang. |
| ER-03 | None | Onion price in Zzzpur mandi (profile A) | The tool's own message (NM-04), not a generic "price not available in the selected mandi" reply. |

## Pass, fail and reporting a bug

A case passes only when the answer matches the expected result and every checklist item. The round passes when every Critical and Major case passes.

| Severity | When | Examples |
| --- | --- | --- |
| Critical | A wrong or misleading price reaches the farmer | An older date shown for "today"; another mandi shown when the named one had no price; a mandi above 40 km; a price that differs from the review site; paddy shown for rice |
| Major | The right data, but the wrong kind of answer | A generic reply instead of the specific message; technical text in a message; the chat hangs or shows nothing |
| Minor | Wording or layout only | A clumsy sentence; a variety name shown oddly; a crop name misspelled in the data (e.g. "Tomatos") |

### What every bug report must contain

1. Case ID and profile (state, district, location set or not).
2. The exact question, as typed, and the language.
3. Date and time asked, in IST.
4. The full answer text and a screenshot.
5. The expected result, and what the review site showed (crop, mandi, date, price; a screenshot or link).
6. Severity from the table above.

Send Critical bugs to the developers the same day. A misspelled crop or mandi name in the data is fixed on the review site, so raise it to the data reviewer, not as a code bug.
