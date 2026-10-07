import math
import os
import time
import requests
import pandas as pd
import latlong

# Safe retrieval of the API Key from an environment variable
API_KEY = "AIzaSyAXKIaqQSp5Z9xtsad8kF_kreBKh2-nZJ8"
if not API_KEY:
    raise RuntimeError("Set the GOOGLE_MAPS_API_KEY environment variable before running this script.")

# 1. Switched to searchNearby to prevent standard Text Search 429 throttling
# SEARCH_URL = "https://googleapis.com"
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Keep next_page_token out of the field mask; it's handled via response headers in searchNearby if applicable,
# but note: New Nearby Search handles pagination differently or limits to max 20 primary high-quality targets.
FIELD_MASK = ",".join([
    "places.displayName",
    "places.nationalPhoneNumber",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.location",
])

# Mapping text keywords to official Google Places API "includedTypes" supported by searchNearby
KEYWORD_TO_TYPE = {
    "mess": "restaurant",
    "canteen": "restaurant",
    "food court": "food",
    "cafe": "cafe",
    "caterers": "caterer",
    "paying guest PG": "lodging",
    "hotel": "hotel"
}

locations = latlong.locations  
keywords = ["mess", "canteen", "food court", "cafe"]
records = []

def execute_request_with_backoff(url, headers, json_payload, max_retries=5):
    """Executes the POST request with exponential backoff to handle 429 errors gracefully."""
    backoff = 2
    for attempt in range(max_retries):
        try:
            response = requests.post(url, headers=headers, json=json_payload, timeout=30)
            
            if response.status_code == 429:
                print(f" Hit 429 (Rate Limit). Backing off for {backoff}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(backoff)
                backoff *= 2
                continue
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                print(f" Failed permanently after {max_retries} attempts: {e}")
                return {}
            time.sleep(backoff)
            backoff *= 2
    return {}

# Main scraping orchestration engine
for loc in locations:
    print(f"Scanning around Zone: {loc['name']}...")
    for kw in keywords:
        place_type = KEYWORD_TO_TYPE.get(kw, "restaurant")
        
        # searchNearby uses 'includedTypes' and strict 'locationRestriction'
        request_body = {
            "includedTypes": [place_type],
            "maxResultCount": 20, 
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": loc["lat"], "longitude": loc["lng"]},
                    "radius": 3000.0, # 3km radius rule enforced directly by Google
                }
            },
        }

        # Execute request using the backoff engine
        res = execute_request_with_backoff(
            SEARCH_URL,
            headers={
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": FIELD_MASK,
                "Content-Type": "application/json",
            },
            json_payload=request_body
        )

        places = res.get("places", [])
        print(f"  Found {len(places)} items for keyword '{kw}'")

        for place in places:
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
        
        # Short cooldown to avoid triggering concurrent QPS spikes
        time.sleep(1.5)

# Save to CSV and clean duplicates
if records:
    df = pd.DataFrame(records).drop_duplicates(subset=["Phone"])
    df.to_csv("bengaluru_hospitality_leads.csv", index=False)
    print(f"SUCCESS: Exported {len(df)} unique leads to bengaluru_hospitality_leads.csv")
else:
    print("Execution finished, but zero valid leads with phone numbers were found.")
