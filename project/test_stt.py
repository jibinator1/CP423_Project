import asyncio
import aiohttp
from livekit.plugins import groq

async def test():
    async with aiohttp.ClientSession() as session:
        try:
            stt = groq.STT(model="whisper-large-v3", http_session=session)
            print("Successfully initialized STT with http_session")
        except TypeError as e:
            print(f"TypeError: {e}")
        except Exception as e:
            print(f"Other error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
