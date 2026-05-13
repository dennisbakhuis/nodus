import re
import unicodedata


def normalize_alias(name: str) -> str:
    """Normalize an alias name for uniqueness comparison.

    Algorithm (§5.5): lowercase, replace all punctuation characters with a space,
    collapse multiple whitespace runs to a single space, strip leading/trailing
    whitespace. Portable across SQLite and PostgreSQL.

    Parameters
    ----------
    name : str
        Display-form alias name.

    Returns
    -------
    str
        Normalized form suitable for storage in ``alias_name_normalised``.
    """
    lowered = name.lower()
    no_punct = "".join(" " if unicodedata.category(ch).startswith("P") else ch for ch in lowered)
    collapsed = re.sub(r"\s+", " ", no_punct).strip()
    return collapsed
