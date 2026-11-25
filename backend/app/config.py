"""Environment-based configuration. All secrets stay server-side."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    app_name: str = "COURTSIDE IQ"
    environment: str = "development"

    # Persistence. SQLite works for local/dev/tests; Postgres + pgvector for production.
    database_url: str = "sqlite:///./courtside.db"
    redis_url: str | None = None

    # Primary data source.
    #   espn: real games, live scores, DraftKings lines, box scores, injuries and rosters from
    #         ESPN's public site API (no key required)
    #   demo: the committed synthetic dataset (offline development and the test suite)
    data_source: str = "espn"
    espn_seasons_nba: int = 3  # current season + two earlier seasons of history
    espn_seasons_cbb: int = 2
    espn_poll_seconds: int = 60

    # Optional keyed providers (enrichment: player prop lines, extra books)
    balldontlie_api_key: str | None = None
    odds_api_key: str | None = None
    sportsdataio_api_key: str | None = None
    odds_api_regions: str = "us"
    odds_api_bookmakers: str = "draftkings,fanduel,betmgm,williamhill_us"

    # AI
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    ai_effort: str = "medium"
    voyage_api_key: str | None = None

    # Assets: base URL of a licensed logo CDN. Without it, original crests are rendered.
    licensed_logo_base_url: str | None = None

    # Background refresh cadence (seconds)
    live_poll_seconds: int = 20
    odds_poll_seconds: int = 300
    enable_scheduler: bool = True

    # Demo data: load the committed dataset (backend/data/demo_snapshot) when present instead of
    # regenerating it with the simulator.
    use_demo_snapshot: bool = True

    # Modelling
    monte_carlo_sims: int = 10_000
    random_seed: int = 20261118
    mlflow_tracking_uri: str | None = None

    # Optional API protection for mutating endpoints
    admin_token: str | None = None
    cors_origins: str = "http://localhost:3000"

    @property
    def demo_mode(self) -> bool:
        return self.data_source == "demo"


@lru_cache
def get_settings() -> Settings:
    return Settings()
