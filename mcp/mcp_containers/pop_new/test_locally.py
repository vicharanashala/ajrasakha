import asyncio

from pop import get_context_from_pop


async def main():

    result = await get_context_from_pop(
        query="best sowing time for paddy in Punjab"
    )

    print(result)


asyncio.run(main())