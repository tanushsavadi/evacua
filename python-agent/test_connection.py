"""
Quick test script to verify API connectivity
"""
import os
import asyncio
import aiohttp

API_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

async def test_connection():
    print(f"🧪 Testing connection to: {API_URL}/api/fire-state\n")
    
    try:
        async with aiohttp.ClientSession() as session:
            print("📡 Sending request...")
            async with session.get(f"{API_URL}/api/fire-state", timeout=aiohttp.ClientTimeout(total=5)) as response:
                print(f"✅ Status: {response.status}")
                
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Response received!")
                    print(f"   Fires: {len(data.get('fires', []))}")
                    print(f"   Firestations: {len(data.get('firestations', []))}")
                    print(f"\n✅ Connection test PASSED!")
                    return True
                else:
                    text = await response.text()
                    print(f"❌ Error: {text[:200]}")
                    return False
    except aiohttp.ClientConnectorError as e:
        print(f"❌ Connection failed!")
        print(f"   Make sure Next.js is running at {API_URL}")
        print(f"   Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_connection())
    exit(0 if result else 1)

