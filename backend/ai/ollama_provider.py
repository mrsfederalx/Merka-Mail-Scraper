"""Ollama local provider for email classification."""

import json
from typing import Optional

from backend.utils.logger import get_logger

log = get_logger("ai_ollama")

PROMPT = """Classify this email address. Respond ONLY with valid JSON.

Email: {email}
Domain: {domain}
Context: {context}

Categories: "junk", "generic", "department", "personal"
JSON: {{"classification":"...","confidence":0.0,"suggested_role":"...","is_decision_maker":false,"reasoning":"..."}}"""


class OllamaProvider:
    """Ollama local API for email classification."""

    def __init__(self, url: str = "http://localhost:11434"):
        self.url = url
        self._client = None

    async def is_available(self) -> bool:
        try:
            import ollama
            client = ollama.Client(host=self.url)
            client.list()
            return True
        except Exception:
            return False

    async def classify(self, email: str, html_context: str = "", domain: str = "") -> dict:
        """Classify an email using Ollama."""
        try:
            import ollama

            if self._client is None:
                self._client = ollama.Client(host=self.url)

            prompt = PROMPT.format(
                email=email,
                domain=domain or email.split('@')[1],
                context=html_context[:500] if html_context else "No context",
            )

            response = self._client.chat(
                model="llama3.1:8b",
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.1},
            )

            text = response["message"]["content"].strip()
            result = _parse_json(text)
            if result:
                result['email'] = email
                result['provider'] = 'ollama'
                return result

        except Exception as e:
            log.warning(f"Ollama error: {str(e)[:100]}")
            raise

        return {'email': email, 'classification': 'unknown', 'confidence': 0.0, 'provider': 'ollama'}


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
