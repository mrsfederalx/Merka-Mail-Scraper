"""Rule-based email tier pre-filter."""

import re

TIER_1_JUNK = {
    'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
    'bot', 'test', 'admin', 'webmaster', 'postmaster', 'hostmaster',
    'mailer-daemon', 'mailer', 'daemon', 'bounce', 'root', 'abuse',
    'spam', 'null', 'devnull', 'nobody', 'noc',
}

TIER_2_GENERIC = {
    'info', 'contact', 'hello', 'support', 'sales', 'office',
    'help', 'mail', 'email', 'enquiry', 'inquiry', 'general',
    'service', 'customer', 'reception', 'feedback', 'request',
    'iletisim', 'bilgi', 'destek', 'satis',  # Turkish
}

TIER_3_DEPARTMENT = {
    'marketing', 'hr', 'ceo', 'director', 'finance', 'billing',
    'press', 'media', 'legal', 'accounting', 'operations', 'it',
    'engineering', 'dev', 'design', 'creative', 'editorial',
    'recruitment', 'hiring', 'partnerships', 'business',
    'pazarlama', 'muhasebe', 'insan-kaynaklari',  # Turkish
}

# Pattern for personal emails (firstname.lastname@)
PERSONAL_PATTERN = re.compile(r'^[a-z]+[._-][a-z]+$')
INITIAL_PATTERN = re.compile(r'^[a-z][._-][a-z]+$')  # f.last


def classify_email_tier(email: str) -> dict:
    """Classify an email into a tier based on its local part.

    Returns:
        {
            'email': str,
            'tier': int (1-4),
            'classification': str,
            'confidence': float (0.0-1.0),
            'suggested_role': str or None,
            'is_decision_maker': bool,
            'reasoning': str,
        }
    """
    local_part = email.split('@')[0].lower().strip()

    # Tier 1: Junk
    if local_part in TIER_1_JUNK:
        return {
            'email': email,
            'tier': 1,
            'classification': 'junk',
            'confidence': 0.95,
            'suggested_role': None,
            'is_decision_maker': False,
            'reasoning': f'Matched junk pattern: {local_part}',
        }

    # Tier 2: Generic
    if local_part in TIER_2_GENERIC:
        return {
            'email': email,
            'tier': 2,
            'classification': 'generic',
            'confidence': 0.90,
            'suggested_role': None,
            'is_decision_maker': False,
            'reasoning': f'Matched generic pattern: {local_part}',
        }

    # Tier 3: Department
    if local_part in TIER_3_DEPARTMENT:
        is_dm = local_part in {'ceo', 'director'}
        return {
            'email': email,
            'tier': 3,
            'classification': 'department',
            'confidence': 0.85,
            'suggested_role': local_part.upper() if is_dm else f'{local_part} department',
            'is_decision_maker': is_dm,
            'reasoning': f'Matched department pattern: {local_part}',
        }

    # Tier 4: Personal (firstname.lastname pattern)
    if PERSONAL_PATTERN.match(local_part) or INITIAL_PATTERN.match(local_part):
        return {
            'email': email,
            'tier': 4,
            'classification': 'personal',
            'confidence': 0.70,  # Lower confidence — needs AI for role
            'suggested_role': None,
            'is_decision_maker': False,  # Unknown — needs AI
            'reasoning': f'Personal email pattern detected: {local_part}',
        }

    # Unknown — needs AI classification
    return {
        'email': email,
        'tier': 0,
        'classification': 'unknown',
        'confidence': 0.30,
        'suggested_role': None,
        'is_decision_maker': False,
        'reasoning': f'No pattern match for: {local_part}',
    }
