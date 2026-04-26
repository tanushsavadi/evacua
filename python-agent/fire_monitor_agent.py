"""
Fetch.ai uAgent for Wildfire Monitoring and Route Optimization
Monitors fire spread and automatically reroutes firefighters for safety
"""

import os
import asyncio
import aiohttp
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from math import radians, cos, sin, asin, sqrt, atan2
from uagents import Agent, Context, Model
from dotenv import load_dotenv

load_dotenv()

# Configuration
API_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3002")
MAPBOX_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "")
MONITORING_INTERVAL = 30  # seconds

print(f"🔧 Configuration:")
print(f"   API_URL: {API_URL}")
print(f"   Monitoring Interval: {MONITORING_INTERVAL}s")
print()

# Agent setup
agent = Agent(
    name="wildfire_monitor",
    seed="wildfire_monitoring_seed_phrase_2025",
    port=8001,
    endpoint=["http://localhost:8001/submit"],
)

print(f"Agent address: {agent.address}")

# Data models
class FireData(Model):
    fire_id: str
    name: str
    lat: float
    lon: float
    polygon: List[List[float]]
    growth_rate: float
    risk_level: str

class RouteUpdate(Model):
    station_id: int
    new_route: Dict
    reason: str
    risk_score: float

class AgentMessage(Model):
    action: str
    message: str
    data: Dict

# Utility functions
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers"""
    R = 6371  # Earth radius in km
    
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return R * c

def point_to_line_distance(point: Tuple[float, float], 
                          line_start: Tuple[float, float], 
                          line_end: Tuple[float, float]) -> float:
    """Calculate shortest distance from point to line segment"""
    px, py = point
    x1, y1 = line_start
    x2, y2 = line_end
    
    # Convert to meters approximation
    dx = (x2 - x1) * 111320 * cos(radians(y1))
    dy = (y2 - y1) * 111320
    
    if dx == 0 and dy == 0:
        return haversine_distance(py, px, y1, x1)
    
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx**2 + dy**2)))
    
    closest_x = x1 + t * (x2 - x1)
    closest_y = y1 + t * (y2 - y1)
    
    return haversine_distance(py, px, closest_y, closest_x)

def does_fire_intersect_route(fire_polygon: List[List[float]], 
                              route_coords: List[List[float]], 
                              threshold_km: float = 2.0) -> bool:
    """Check if fire polygon intersects with route path"""
    for route_point in route_coords:
        route_lon, route_lat = route_point
        
        for fire_point in fire_polygon:
            fire_lon, fire_lat = fire_point
            distance = haversine_distance(route_lat, route_lon, fire_lat, fire_lon)
            
            if distance < threshold_km:
                return True
    
    return False

async def fetch_fire_state() -> Optional[Dict]:
    """Fetch current fire and station data"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/api/fire-state", timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Fetched fire state: {len(data.get('fires', []))} fires, {len(data.get('firestations', []))} stations")
                    return data
                else:
                    error_text = await response.text()
                    print(f"❌ Error fetching fire state: HTTP {response.status}")
                    print(f"   Response: {error_text[:200]}")
                    return None
    except aiohttp.ClientConnectorError as e:
        print(f"❌ Connection error - Is the Next.js server running?")
        print(f"   Trying to connect to: {API_URL}/api/fire-state")
        print(f"   Error: {e}")
        return None
    except asyncio.TimeoutError:
        print(f"❌ Request timeout - API not responding")
        return None
    except Exception as e:
        print(f"❌ Unexpected error in fetch_fire_state: {type(e).__name__}: {e}")
        return None

async def get_alternative_route(station_lat: float, station_lon: float,
                               fire_lat: float, fire_lon: float) -> Optional[Dict]:
    """Calculate alternative route using Mapbox Directions API"""
    if not MAPBOX_TOKEN:
        # Fallback: simple offset away from fire
        angle = atan2(station_lat - fire_lat, station_lon - fire_lon)
        offset_distance = 0.02  # ~2km
        new_lat = station_lat + offset_distance * cos(angle)
        new_lon = station_lon + offset_distance * sin(angle)
        
        return {
            "from": [station_lon, station_lat],
            "to": [new_lon, new_lat],
            "waypoints": [[new_lon, new_lat]],
            "geometry": {
                "type": "LineString",
                "coordinates": [[station_lon, station_lat], [new_lon, new_lat]]
            }
        }
    
    try:
        # Calculate safe waypoint (opposite direction from fire)
        angle = atan2(station_lat - fire_lat, station_lon - fire_lon)
        offset = 0.02  # ~2km offset
        waypoint_lat = station_lat + offset * sin(angle)
        waypoint_lon = station_lon + offset * cos(angle)
        
        # Use Mapbox Directions API
        url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{station_lon},{station_lat};{waypoint_lon},{waypoint_lat}?geometries=geojson&access_token={MAPBOX_TOKEN}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("routes"):
                        route = data["routes"][0]
                        return {
                            "from": [station_lon, station_lat],
                            "to": [waypoint_lon, waypoint_lat],
                            "waypoints": [[waypoint_lon, waypoint_lat]],
                            "geometry": route["geometry"],
                            "distance": route.get("distance", 0),
                            "duration": route.get("duration", 0)
                        }
        
        return None
    except Exception as e:
        print(f"Error calculating route: {e}")
        return None

async def post_route_update(station_id: int, new_route: Dict, reason: str, risk_score: float):
    """Post route update to API"""
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "station_id": station_id,
                "new_route": new_route,
                "reason": reason,
                "risk_score": risk_score
            }
            async with session.post(
                f"{API_URL}/api/update-routes",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    print(f"✅ Route update posted for station {station_id}")
                else:
                    print(f"❌ Failed to post route: {response.status}")
    except Exception as e:
        print(f"Error posting route update: {e}")

async def post_vapi_alert(action: str, message: str, data: Dict = None):
    """Send alert to VAPI via webhook"""
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "action": action,
                "message": message,
                "data": data or {}
            }
            async with session.post(
                f"{API_URL}/api/vapi-webhook",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    print(f"🎤 VAPI alert sent: {message}")
                else:
                    print(f"Failed to send VAPI alert: {response.status}")
    except Exception as e:
        print(f"Error sending VAPI alert: {e}")

# Main monitoring behavior
@agent.on_interval(period=MONITORING_INTERVAL)
async def monitor_fires(ctx: Context):
    """Main monitoring loop - runs every 30 seconds"""
    ctx.logger.info(f"[{datetime.now().isoformat()}] 🔥 Monitoring fires...")
    
    # Fetch current fire state
    fire_data = await fetch_fire_state()
    if not fire_data:
        ctx.logger.warning("No fire data available")
        return
    
    fires = fire_data.get("fires", [])
    firestations = fire_data.get("firestations", [])
    
    ctx.logger.info(f"Found {len(fires)} active fires, {len(firestations)} stations")
    
    # Analyze each fire
    for fire in fires:
        ctx.logger.info(f"Analyzing {fire['name']} ({fire['risk_level']})")
        
        # Check each fire station
        for station in firestations:
            # Calculate if station is at risk
            distance = haversine_distance(
                station['lat'], station['lon'],
                fire['lat'], fire['lon']
            )
            
            # Risk calculation
            risk_multipliers = {
                'critical': 1.0,
                'high': 0.8,
                'medium': 0.6,
                'low': 0.4
            }
            multiplier = risk_multipliers.get(fire['risk_level'], 0.5)
            risk_score = (fire['growth_rate'] * multiplier) / max(distance, 0.5)
            
            # Check if fire intersects potential route to fire
            # Simulate route as straight line for intersection check
            route_coords = [
                [station['lon'], station['lat']],
                [fire['lon'], fire['lat']]
            ]
            
            intersects = does_fire_intersect_route(
                fire['polygon_coords'],
                route_coords,
                threshold_km=3.0  # 3km safety buffer
            )
            
            # Trigger reroute if high risk or intersection
            if risk_score > 0.7 or intersects:
                reason = f"{'Fire intersecting route' if intersects else 'High risk detected'}: {fire['name']} approaching Station {station['id']}"
                
                ctx.logger.warning(f"⚠️  {reason}")
                ctx.logger.info(f"Risk score: {risk_score:.2f}, Distance: {distance:.1f}km")
                
                # Calculate alternative route
                new_route = await get_alternative_route(
                    station['lat'], station['lon'],
                    fire['lat'], fire['lon']
                )
                
                if new_route:
                    # Post route update
                    await post_route_update(
                        station['id'],
                        new_route,
                        reason,
                        risk_score
                    )
                    
                    # Send VAPI alert
                    await post_vapi_alert(
                        "route_update",
                        f"Rerouting Station {station['id']} - {fire['name']} crossing path. New route calculated.",
                        {
                            "station_id": station['id'],
                            "fire_name": fire['name'],
                            "risk_score": risk_score,
                            "distance_km": round(distance, 1)
                        }
                    )
                    
                    ctx.logger.info(f"✅ Rerouted Station {station['id']} away from {fire['name']}")
            
            # Generate evacuation recommendations for critical fires
            if fire['risk_level'] in ['critical', 'high']:
                if fire['estimated_radius'] > 1000:  # > 1km radius
                    await post_vapi_alert(
                        "evacuation",
                        f"Evacuation recommended near {fire['name']}. Fire radius: {fire['estimated_radius']/1000:.1f}km",
                        {
                            "fire_name": fire['name'],
                            "fire_id": fire['id'],
                            "radius_km": fire['estimated_radius'] / 1000
                        }
                    )
    
    ctx.logger.info("✓ Monitoring cycle complete\n")

@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info("=" * 50)
    ctx.logger.info("🤖 Fetch.ai Wildfire Monitor Agent Starting")
    ctx.logger.info(f"📡 API URL: {API_URL}")
    ctx.logger.info(f"🔑 Agent Address: {agent.address}")
    ctx.logger.info(f"⏱️  Monitoring interval: {MONITORING_INTERVAL} seconds")
    ctx.logger.info("=" * 50)

if __name__ == "__main__":
    agent.run()

