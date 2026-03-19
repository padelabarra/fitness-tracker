"""
Telegram food logging integration for OpenClaw.

Exposes: async def log_food_from_telegram(message: str, gemini_client) -> str

OpenClaw calls this function when food-related keywords are detected in a message.
"""

import os
import json
import logging
import httpx

from dotenv import load_dotenv

load_dotenv()

TRACKER_API_URL = os.environ['TRACKER_API_URL']
API_SECRET = os.environ['API_SECRET']
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')

logger = logging.getLogger(__name__)

FOOD_PARSE_PROMPT = """
You are a nutrition parser. Extract structured data from a food log message.

Return ONLY valid JSON with these fields:
{
  "meal_type": one of ["breakfast", "lunch", "dinner", "snack", "supplement"],
  "food_description": "concise description of what was eaten",
  "calories_approx": integer or null,
  "protein_g": number or null,
  "notes": "any relevant notes" or null
}

If the user doesn't mention a meal type, infer from context or default to "snack".
If calories or protein aren't mentioned, return null (do not guess).

Message to parse:
"""


async def log_food_from_telegram(message: str, gemini_client) -> str:
    """
    Parse a food message with Gemini and log it to the Next.js API.

    Args:
        message: The raw Telegram message text
        gemini_client: An initialized Gemini client (google.generativeai.GenerativeModel)

    Returns:
        Confirmation string for Telegram reply
    """
    # Parse with Gemini
    try:
        response = gemini_client.generate_content(FOOD_PARSE_PROMPT + message)
        raw = response.text.strip()

        # Strip markdown code block if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]

        parsed = json.loads(raw.strip())
    except Exception as e:
        logger.error(f'Gemini parse error: {e}')
        return '❌ Could not parse food entry. Try: "Lunch — chicken salad, ~400 kcal, 35g protein"'

    # Post to Next.js API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f'{TRACKER_API_URL}/api/nutrition',
                json=parsed,
                headers={'api-secret': API_SECRET},
            )
            resp.raise_for_status()
    except Exception as e:
        logger.error(f'API post error: {e}')
        return '❌ Logged locally but failed to save. Check tracker API.'

    meal = parsed.get('meal_type', 'meal')
    desc = parsed.get('food_description', 'food')
    cal = parsed.get('calories_approx')
    prot = parsed.get('protein_g')

    parts = [f'✅ Logged: {meal} — {desc}']
    if cal:
        parts.append(f'(~{cal} kcal')
    if prot:
        parts.append(f'{prot}g prot)')
    elif cal:
        parts.append(')')

    return ' '.join(parts)
