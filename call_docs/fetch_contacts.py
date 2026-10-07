import math
import os
import time
import requests
import pandas as pd
import latlong

API_KEY = "AIzaSyAXKIaqQSp5Z9xtsad8kF_kreBKh2-nZJ8"
if not API_KEY:
    raise RuntimeError("Set the GOOGLE_MAPS_API_KEY environment variable before running this script.")

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.displayName",
    "places.nationalPhoneNumber",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.location",
    "nextPageToken",
])


def distance_meters(lat1, lng1, lat2, lng2):
    earth_radius_m = 6_371_000
    lat1, lng1, lat2, lng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(value))

# Target coordinates across key zones (e.g., Koramangala, Whitefield, Indiranagar)

locations = [
    # {"name": "Koramangala", "lat": 12.9352, "lng": 77.6245},
    # {"name": "Indiranagar", "lat": 12.9784, "lng": 77.6408},
    {"name": "Whitefield", "lat": 12.9698, "lng": 77.7500},
    # {"name": "BTM Layout", "lat": 12.9166, "lng": 77.6101},
    # {"name": "Banashankari", "lat": 12.9255, "lng": 77.5468},
    # {"name": "JP Nagar", "lat": 12.9105, "lng": 77.5857},
]
'''

locations = latlong.locations  # Use the locations defined in latlong.py

'''

keywords = ["caterers", "restaurant", "paying guest PG", "hotel"]
# keywords = ["mess","canteen","food court", "cafe"]
records = []

for loc in locations:
    for kw in keywords:
        request_body = {
            "textQuery": kw,
            "pageSize": 20,
            "locationBias": {
                "circle": {
                    "center": {"latitude": loc["lat"], "longitude": loc["lng"]},
                    "radius": 3000,
                }
            },
        }
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
                if not coordinates or distance_meters(
                    loc["lat"], loc["lng"], coordinates["latitude"], coordinates["longitude"]
                ) > 3000:
                    continue

                phone = place.get("nationalPhoneNumber")
                if phone:  # Keep only listings with direct contact numbers
                    records.append({
                        "Category": kw,
                        "Zone": loc["name"],
                        "Name": place.get("displayName", {}).get("text"),
                        "Phone": phone,
                        "Address": place.get("formattedAddress"),
                        "Rating": place.get("rating"),
                        "Reviews": place.get("userRatingCount")
                    })
                time.sleep(0.1)  # Respect API rate limits

            next_page_token = res.get("nextPageToken")
            if not next_page_token:
                break

# Save to CSV
df = pd.DataFrame(records).drop_duplicates(subset=["Phone"])
df.to_csv("bengaluru_hospitality_leads.csv", index=False)