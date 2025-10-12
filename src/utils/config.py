"""
Configuration loader for the SMC CS Opportunities Bot.

Loads and manages configuration from:
- YAML files (config/*.yaml)
- Environment variables (.env)
- Default values

Provides type-safe access to all configuration settings.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from dotenv import load_dotenv

from src.utils.logger import get_logger

logger = get_logger(__name__)


class Config:
    """
    Configuration manager for the bot.

    Loads configuration from YAML files and environment variables,
    providing typed access to all settings.
    """

    def __init__(self, config_dir: str = "config"):
        """
        Initialize configuration loader.

        Args:
            config_dir: Directory containing configuration YAML files
        """
        self.config_dir = Path(config_dir)
        self._config: Dict[str, Any] = {}

        # Load environment variables
        load_dotenv()

        # Load all configuration files
        self._load_sources_config()
        self._load_watchlist()
        self._load_prestige_hackathons()

        logger.info("Configuration loaded successfully")

    def _load_yaml(self, filename: str) -> Dict[str, Any]:
        """Load a YAML configuration file."""
        filepath = self.config_dir / filename

        if not filepath.exists():
            logger.warning(f"Configuration file not found: {filepath}")
            return {}

        try:
            with open(filepath, "r") as f:
                data = yaml.safe_load(f)
                logger.debug(f"Loaded configuration from {filepath}")
                return data or {}
        except Exception as e:
            logger.error(f"Error loading {filepath}: {e}")
            return {}

    def _load_sources_config(self):
        """Load main sources configuration."""
        self._config["sources"] = self._load_yaml("sources.yaml")

    def _load_watchlist(self):
        """Load company watchlist."""
        self._config["watchlist"] = self._load_yaml("watchlist.yaml")

    def _load_prestige_hackathons(self):
        """Load prestigious hackathons list."""
        self._config["prestige"] = self._load_yaml("prestige_hackathons.yaml")

    # ===== SMC Location =====

    @property
    def smc_name(self) -> str:
        """Get SMC name."""
        return self._config.get("sources", {}).get("smc", {}).get("name", "Santa Monica College")

    @property
    def smc_latitude(self) -> float:
        """Get SMC latitude."""
        return self._config.get("sources", {}).get("smc", {}).get("latitude", 34.0168)

    @property
    def smc_longitude(self) -> float:
        """Get SMC longitude."""
        return self._config.get("sources", {}).get("smc", {}).get("longitude", -118.4695)

    @property
    def smc_address(self) -> str:
        """Get SMC address."""
        return self._config.get("sources", {}).get("smc", {}).get(
            "address", "1900 Pico Blvd, Santa Monica, CA 90405"
        )

    # ===== Filtering Rules =====

    @property
    def internship_radius_miles(self) -> int:
        """Get internship search radius in miles."""
        env_radius = os.getenv("SMC_RADIUS_MILES")
        if env_radius:
            return int(env_radius)
        return self._config.get("sources", {}).get("filtering", {}).get("internship_radius_miles", 40)

    @property
    def internship_radius_km(self) -> float:
        """Get internship search radius in kilometers."""
        return self.internship_radius_miles * 1.60934

    @property
    def include_remote(self) -> bool:
        """Whether to include remote opportunities."""
        return self._config.get("sources", {}).get("filtering", {}).get("include_remote", True)

    @property
    def remote_requirements(self) -> List[str]:
        """Get remote opportunity location requirements."""
        return self._config.get("sources", {}).get("filtering", {}).get("remote_requirements", [
            "United States", "US-based", "USA"
        ])

    # ===== Posting Configuration =====

    @property
    def min_opportunities_per_post(self) -> int:
        """Minimum opportunities to post per cycle."""
        env_min = os.getenv("MIN_OPPORTUNITIES_PER_POST")
        if env_min:
            return int(env_min)
        return self._config.get("sources", {}).get("posting", {}).get("min_opportunities", 5)

    @property
    def max_opportunities_per_post(self) -> int:
        """Maximum opportunities to post per cycle."""
        env_max = os.getenv("MAX_OPPORTUNITIES_PER_POST")
        if env_max:
            return int(env_max)
        return self._config.get("sources", {}).get("posting", {}).get("max_opportunities", 8)

    @property
    def posting_frequency_days(self) -> int:
        """Posting frequency in days."""
        return self._config.get("sources", {}).get("posting", {}).get("frequency_days", 3)

    @property
    def allow_duplicates(self) -> bool:
        """Whether to allow duplicate postings."""
        return self._config.get("sources", {}).get("posting", {}).get("allow_duplicates", False)

    # ===== Scoring Configuration =====

    @property
    def scoring_weights(self) -> Dict[str, int]:
        """Get scoring weights."""
        return self._config.get("sources", {}).get("scoring", {})

    @property
    def brand_companies(self) -> Dict[str, List[str]]:
        """Get brand companies by tier."""
        return self._config.get("sources", {}).get("brand_companies", {})

    # ===== Rate Limiting =====

    @property
    def default_delay(self) -> float:
        """Default delay between API requests (seconds)."""
        env_delay = os.getenv("RATE_LIMIT_DELAY_SECONDS")
        if env_delay:
            return float(env_delay)
        return self._config.get("sources", {}).get("rate_limiting", {}).get("default_delay", 1.0)

    @property
    def geocoding_delay(self) -> float:
        """Delay for geocoding requests (seconds)."""
        return self._config.get("sources", {}).get("rate_limiting", {}).get("geocoding_delay", 1.2)

    @property
    def max_retries(self) -> int:
        """Maximum retries for failed requests."""
        return self._config.get("sources", {}).get("rate_limiting", {}).get("max_retries", 3)

    @property
    def retry_backoff(self) -> int:
        """Retry backoff multiplier."""
        return self._config.get("sources", {}).get("rate_limiting", {}).get("retry_backoff", 2)

    # ===== OpenAI Configuration =====

    @property
    def openai_api_key(self) -> str:
        """Get OpenAI API key from environment."""
        key = os.getenv("OPENAI_API_KEY", "")
        if not key:
            logger.warning("OPENAI_API_KEY not set in environment")
        return key

    @property
    def openai_model(self) -> str:
        """Get OpenAI model name."""
        return self._config.get("sources", {}).get("openai", {}).get("model", "gpt-4o")

    @property
    def openai_temperature(self) -> float:
        """Get OpenAI temperature setting."""
        return self._config.get("sources", {}).get("openai", {}).get("temperature", 0.3)

    @property
    def openai_max_tokens(self) -> int:
        """Get OpenAI max tokens."""
        return self._config.get("sources", {}).get("openai", {}).get("max_tokens", 500)

    # ===== Discord Configuration =====

    @property
    def discord_webhook_url(self) -> str:
        """Get Discord webhook URL from environment."""
        url = os.getenv("DISCORD_WEBHOOK_URL", "")
        if not url:
            logger.warning("DISCORD_WEBHOOK_URL not set in environment")
        return url

    # ===== USAJOBS Configuration =====

    @property
    def usajobs_api_key(self) -> str:
        """Get USAJOBS API key from environment."""
        key = os.getenv("USAJOBS_API_KEY", "")
        if not key:
            logger.warning("USAJOBS_API_KEY not set in environment")
        return key

    @property
    def usajobs_user_agent(self) -> str:
        """Get USAJOBS User-Agent from environment."""
        agent = os.getenv("USAJOBS_USER_AGENT", "")
        if not agent:
            logger.warning("USAJOBS_USER_AGENT not set in environment")
        return agent

    # ===== Nominatim Configuration =====

    @property
    def nominatim_user_agent(self) -> str:
        """Get Nominatim User-Agent from environment."""
        agent = os.getenv("NOMINATIM_USER_AGENT", "SMC-CS-Opportunities-Bot/1.0")
        return agent

    # ===== Database Configuration =====

    @property
    def database_path(self) -> str:
        """Get database file path."""
        return self._config.get("sources", {}).get("database", {}).get("path", "data/opportunities.db")

    @property
    def retention_days(self) -> int:
        """Get data retention period in days."""
        return self._config.get("sources", {}).get("database", {}).get("retention_days", 90)

    # ===== Watchlists =====

    @property
    def greenhouse_companies(self) -> List[str]:
        """Get list of Greenhouse company tokens."""
        return self._config.get("watchlist", {}).get("greenhouse", [])

    @property
    def lever_companies(self) -> List[str]:
        """Get list of Lever company sites."""
        return self._config.get("watchlist", {}).get("lever", [])

    @property
    def ashby_companies(self) -> List[str]:
        """Get list of Ashby organization identifiers."""
        return self._config.get("watchlist", {}).get("ashby", [])

    # ===== Prestigious Hackathons =====

    @property
    def whitelisted_hackathons(self) -> List[str]:
        """Get list of whitelisted prestigious hackathons."""
        return self._config.get("prestige", {}).get("whitelisted", [])

    @property
    def local_socal_hackathons(self) -> List[str]:
        """Get list of local SoCal hackathons."""
        return self._config.get("prestige", {}).get("local_socal", [])

    # ===== Logging Configuration =====

    @property
    def log_level(self) -> str:
        """Get log level."""
        return os.getenv("LOG_LEVEL", "INFO").upper()

    @property
    def log_file(self) -> str:
        """Get log file path."""
        return self._config.get("sources", {}).get("logging", {}).get("file", "logs/bot.log")


# Global configuration instance
_config_instance: Optional[Config] = None


def get_config() -> Config:
    """
    Get or create the global configuration instance.

    Returns:
        Config instance
    """
    global _config_instance

    if _config_instance is None:
        _config_instance = Config()

    return _config_instance


if __name__ == "__main__":
    # Test configuration loading
    config = get_config()

    print("=== SMC Configuration ===")
    print(f"Name: {config.smc_name}")
    print(f"Coordinates: ({config.smc_latitude}, {config.smc_longitude})")
    print(f"Address: {config.smc_address}")

    print("\n=== Filtering ===")
    print(f"Radius: {config.internship_radius_miles} miles ({config.internship_radius_km:.2f} km)")
    print(f"Include Remote: {config.include_remote}")

    print("\n=== Posting ===")
    print(f"Opportunities per post: {config.min_opportunities_per_post}-{config.max_opportunities_per_post}")
    print(f"Frequency: Every {config.posting_frequency_days} days")

    print("\n=== Watchlists ===")
    print(f"Greenhouse companies: {len(config.greenhouse_companies)}")
    print(f"Lever companies: {len(config.lever_companies)}")
    print(f"Ashby companies: {len(config.ashby_companies)}")

    print("\n=== Hackathons ===")
    print(f"Whitelisted: {len(config.whitelisted_hackathons)}")

    print("\n=== API Keys ===")
    print(f"OpenAI API Key: {'✓' if config.openai_api_key else '✗'}")
    print(f"Discord Webhook: {'✓' if config.discord_webhook_url else '✗'}")
    print(f"USAJOBS API Key: {'✓' if config.usajobs_api_key else '✗'}")
