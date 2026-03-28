"""Email classification orchestrator — tier filter + AI fallback chain."""

from typing import Optional

from backend.ai.tier_filter import classify_email_tier
from backend.ai.gemini_provider import GeminiProvider
from backend.ai.groq_provider import GroqProvider
from backend.ai.ollama_provider import OllamaProvider
from backend.config import get_settings
from backend.utils.logger import get_logger

log = get_logger("ai_classifier")


class EmailClassifier:
    """Orchestrates email classification with rule-based pre-filter and AI fallback."""

    def __init__(self):
        self._providers: list = []
        self._initialized = False

    def _ensure_initialized(self):
        """Lazy-initialize providers from settings."""
        if self._initialized:
            return

        settings = get_settings()
        self._providers = []

        # Build provider chain based on priority
        for provider_name in settings.ai_classification.provider_priority:
            if provider_name == "gemini" and settings.api_keys.gemini_api_key:
                self._providers.append(GeminiProvider(settings.api_keys.gemini_api_key))
            elif provider_name == "groq" and settings.api_keys.groq_api_key:
                self._providers.append(GroqProvider(settings.api_keys.groq_api_key))
            elif provider_name == "ollama":
                self._providers.append(OllamaProvider(settings.api_keys.ollama_url))

        self._initialized = True

    def reload(self):
        """Force re-initialization of providers."""
        self._initialized = False
        self._providers = []

    async def classify(
        self,
        email: str,
        html_context: str = "",
        domain: str = "",
    ) -> dict:
        """Classify an email.

        Flow:
        1. Rule-based tier filter (instant, no API call)
        2. If confidence > 0.9 → return immediately
        3. Otherwise → try AI providers in priority order
        4. If all fail → return tier filter result as fallback
        """
        # Step 1: Rule-based
        tier_result = classify_email_tier(email)

        # Step 2: High confidence → return immediately
        if tier_result['confidence'] >= 0.9:
            log.debug(f"Tier filter: {email} -> {tier_result['classification']} ({tier_result['confidence']})")
            return tier_result

        # Step 3: AI classification
        settings = get_settings()
        if not settings.ai_classification.enabled:
            return tier_result

        self._ensure_initialized()

        if not domain:
            domain = email.split('@')[1] if '@' in email else ''

        for provider in self._providers:
            try:
                result = await provider.classify(email, html_context, domain)
                if result and result.get('classification') != 'unknown':
                    # Merge tier info
                    tier_map = {'junk': 1, 'generic': 2, 'department': 3, 'personal': 4}
                    result['tier'] = tier_map.get(result.get('classification', ''), 0)
                    log.debug(f"AI: {email} -> {result['classification']} via {result.get('provider')}")
                    return result
            except Exception:
                continue  # Try next provider

        # Step 4: Fallback to tier filter
        log.debug(f"AI fallback: {email} -> tier filter result")
        return tier_result


# Singleton
classifier = EmailClassifier()
