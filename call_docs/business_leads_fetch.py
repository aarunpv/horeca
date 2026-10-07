import math
import os
import time
from typing import Dict, List

import pandas as pd
import requests

import latlong

API_KEY = "AIzaSyAXKIaqQSp5Z9xtsad8kF_kreBKh2-nZJ8"
if not API_KEY:
    raise RuntimeError("Set the GOOGLE_MAPS_API_KEY environment variable before running this script.")

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.formattedAddress",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.location",
    "nextPageToken",
])

TARGET_RADIUS_METERS = 3000
CSV_PATH = "bengaluru_business_leads.csv"

SEARCH_GROUPS: Dict[str, List[str]] = {
    "cloud_kitchen": [
        "cloud kitchen",
        "dark kitchen",
        "delivery kitchen",
        "commissary kitchen",
        "food production kitchen",
    ],
    "bakery": [
        "bakery",
        "cake shop",
        "bread bakery",
        "pastry shop",
        "confectionery shop",
        "artisan bakery",
    ],
    "horeca": [
        "restaurant",
        "hotel",
        "cafe",
        "caterer",
        "banquet hall",
        "food court",
        "canteen",
        "mess",
    ],
    "pg": [
        "paying guest",
        "pg",
        "hostel",
        "student accommodation",
        "mens pg",
        "womens pg",
        "guest house",
    ],
    "fmcg_consumer": [
        "pulses wholesaler",
        "dal supplier",
        "flour mill",
        "atta wholesaler",
        "rice mill",
        "grains supplier",
        "food grains distributor",
        "cereal supplier",
        "grocery distributor",
        "spice wholesaler",
        "wholesale grocery",
    ],
}


def distance_meters(lat1, lng1, lat2, lng2):
    earth_radius_m = 6_371_000
    lat1, lng1, lat2, lng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(value))


def fetch_search_results(loc, query):
    request_body = {
        "textQuery": query,
        "pageSize": 20,
        "locationBias": {
            "circle": {
                "center": {"latitude": loc["lat"], "longitude": loc["lng"]},
                "radius": TARGET_RADIUS_METERS,
            }
        },
    }

    records = []
    next_page_token = None

    while True:
        if next_page_token:
            request_body["pageToken"] = next_page_token
            time.sleep(2)

        response = requests.post(
            SEARCH_URL,
            headers={
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": FIELD_MASK,
                "Content-Type": "application/json",
            },
            json=request_body,
            timeout=30,
        )
        response.raise_for_status()
        res = response.json()

        for place in res.get("places", []):
            coordinates = place.get("location", {})
            if not coordinates:
                continue

            dist = distance_meters(
                loc["lat"], loc["lng"], coordinates["latitude"], coordinates["longitude"]
            )
            if dist > TARGET_RADIUS_METERS:
                continue

            phone = place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber")
            if not phone:
                continue

            records.append({
                "Category": query,
                "Zone": loc["name"],
                "Name": place.get("displayName", {}).get("text"),
                "Phone": phone,
                "Address": place.get("formattedAddress"),
                "Website": place.get("websiteUri"),
                "Rating": place.get("rating"),
                "Reviews": place.get("userRatingCount"),
                "PlaceId": place.get("id"),
            })
            time.sleep(0.1)

        next_page_token = res.get("nextPageToken")
        if not next_page_token:
            break

    return records


def main():
    all_records = []
    for loc in latlong.locations:
        for group_name, queries in SEARCH_GROUPS.items():
            for query in queries:
                try:
                    all_records.extend(fetch_search_results(loc, query))
                except requests.exceptions.HTTPError as exc:
                    print(f"HTTP error for {loc['name']} / {query}: {exc}")
                    continue
                except Exception as exc:
                    print(f"Error for {loc['name']} / {query}: {exc}")
                    continue

    if all_records:
        df = pd.DataFrame(all_records)
        df = df.drop_duplicates(subset=["Phone", "Name", "Zone"]).sort_values(["Zone", "Category", "Name"]).reset_index(drop=True)
        df.to_csv(CSV_PATH, index=False)
        print(f"Saved {len(df)} leads to {CSV_PATH}")
    else:
        print("No records found. Check your API key and query terms.")


if __name__ == "__main__":
    main()
