import json
import httpx
import os

LIVE_API_URL = os.getenv("LIVE_API_URL", "http://localhost:2026")
ASSISTANT_ID = os.getenv("ASSISTANT_ID", "")



def build_payload(query: str) -> dict:
    return {
        "assistant_id": ASSISTANT_ID,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": query,
                }
            ],
            "latitude": None,
            "longitude": None,
        },
        "stream": True,
        "stream_mode": "values",
    }


def main():
    query = "What is the weather today in Ropar district of Punjab state?"

    with httpx.stream(
        "POST",
        API_URL,
        json=build_payload(query),
        timeout=120,
    ) as response:
        print("Status code:", response.status_code)
        print("Headers:", response.headers)
        print("\n--- STREAM EVENTS ---\n")

        for line in response.iter_lines():
            if not line:
                continue

            print(line)

            if line.startswith("data: "):
                raw_data = line.replace("data: ", "", 1)

                if raw_data == "[DONE]":
                    print("DONE")
                    break

                try:
                    parsed = json.loads(raw_data)
                    print("PARSED:", json.dumps(parsed, indent=2)[:2000])
                except Exception:
                    pass


if __name__ == "__main__":
    main()