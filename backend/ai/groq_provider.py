"""Groq API provider for email classification."""

import json
from typing import Optional

from backend.utils.logger import get_logger

log = get_logger("ai_groq")

PROMPT = """Classify this email address. Respond ONLY with valid JSON.

Email: {email}
Domain: {domain}
Context: {context}

Categories: "junk", "generic", "department", "personal"
JSON format: {{"classification":"...","confidence":0.0,"suggested_role":"...","is_decision_maker":false,"reasoning":"..."}}"""


class GroqProvider:
    """Groq API for email classification."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def classify(self, email: str, html_context: str = "", domain: str = "") -> dict:
        """Classify an email using Groq."""
        try:
            from groq import Groq

            if self._client is None:
                self._client = Groq(api_key=self.api_key)

            prompt = PROMPT.format(
                email=email,
                domain=domain or email.split('@')[1],
                context=html_context[:500] if html_context else "No context",
            )

            completion = self._client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=256,
            )

            text = completion.choices[0].message.content.strip()
            result = _parse_json(text)
            if result:
                result['email'] = email
                result['provider'] = 'groq'
                return result

        except Exception as e:
            log.warning(f"Groq error: {str(e)[:100]}")
            raise

        return {'email': email, 'classification': 'unknown', 'confidence': 0.0, 'provider': 'groq'}


def _parse_json(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return None
