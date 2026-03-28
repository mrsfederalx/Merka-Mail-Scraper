"""Gemini Flash API provider for email classification."""

import json
from typing import Optional

from backend.utils.logger import get_logger

log = get_logger("ai_gemini")

PROMPT_TEMPLATE = """You are an email classification expert. Analyze this email address and its context.

Email: {email}
Domain: {domain}
HTML Context Around Email: {context}

Classify into one of:
- "junk": noreply, bot, system-generated, test emails
- "generic": info@, contact@, hello@, support@ - departmental catch-all
- "department": marketing@, hr@, sales@, press@ - specific department
- "personal": firstname.lastname@, first@ - individual person

Also determine:
- Is this likely a decision-maker (CEO, owner, director, manager)?
- What role might this person have?

Respond ONLY with valid JSON:
{{"classification":"...","confidence":0.0,"suggested_role":"...","is_decision_maker":false,"reasoning":"..."}}"""


class GeminiProvider:
    """Gemini Flash API for email classification."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._model = None

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def classify(self, email: str, html_context: str = "", domain: str = "") -> dict:
        """Classify an email using Gemini."""
        try:
            import google.generativeai as genai

            if self._model is None:
                genai.configure(api_key=self.api_key)
                self._model = genai.GenerativeModel('gemini-1.5-flash')

            prompt = PROMPT_TEMPLATE.format(
                email=email,
                domain=domain or email.split('@')[1],
                context=html_context[:500] if html_context else "No context available",
            )

            response = self._model.generate_content(prompt)
            text = response.text.strip()

            # Parse JSON from response
            result = _parse_json_response(text)
            if result:
                result['email'] = email
                result['provider'] = 'gemini'
                return result

        except Exception as e:
            log.warning(f"Gemini error: {str(e)[:100]}")
            raise

        return {'email': email, 'classification': 'unknown', 'confidence': 0.0, 'provider': 'gemini'}


def _parse_json_response(text: str) -> Optional[dict]:
    """Extract JSON from AI response."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON in text
    import re
    match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
