from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


class serverSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', hide_input_in_errors=True)

    # Backend-only PostgreSQL credentials; never use a Supabase API key here.
    supabase_db_host: str | None = None
    supabase_db_port: int = Field(default=5432, ge=1, le=65535)
    supabase_db_name: str = 'postgres'
    supabase_db_user: str | None = None
    supabase_db_password: SecretStr | None = None
    supabase_database_url: SecretStr | None = None
    supabase_db_sslmode: Literal['require', 'verify-ca', 'verify-full'] = 'require'
    session_minutes: int = Field(default=180, ge=1, le=1440)
    session_cookie_name: str = Field(default='attendance_session', min_length=1, max_length=64)
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal['lax', 'strict', 'none'] = 'lax'
    log_level: Literal['DEBUG', 'INFO', 'WARNING', 'ERROR'] = 'INFO'
    log_file: str = 'logs/api.log'
    cors_origins: list[str] = ['http://localhost:3000']
    allowed_hosts: list[str] = ['localhost', '127.0.0.1']
    docs_enabled: bool = False
    max_body_bytes: int = Field(default=16384, ge=1024, le=1048576)
    photo_storage_dir: str = 'media/photos'
    photo_frame_dir: str = 'media/frames'
    notification_catalog_path: str = str(
        Path(__file__).resolve().parents[1] / 'notification-config' / 'catalog.json'
    )
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
    auth_rate_limit_per_minute: int = Field(default=10, ge=1, le=100)

    @model_validator(mode='after')
    def validate_database(self):
        if self.session_cookie_samesite == 'none' and not self.session_cookie_secure:
            raise ValueError('SESSION_COOKIE_SECURE must be true when SameSite is none')
        database_parts = [
            self.supabase_db_host,
            self.supabase_db_user,
            self.supabase_db_password,
        ]
        has_database_parts = any(value is not None for value in database_parts)
        if has_database_parts:
            if self.supabase_database_url is not None:
                raise ValueError('Use SUPABASE_DATABASE_URL or SUPABASE_DB_* credentials, not both')
            if any(value is None or value == '' for value in database_parts):
                raise ValueError(
                    'SUPABASE_DB_HOST, SUPABASE_DB_USER, and SUPABASE_DB_PASSWORD are all required'
                )
        elif self.supabase_database_url is None:
            raise ValueError('Supabase PostgreSQL configuration is required')
        database_url = self.database_connection_url()
        if not all(
            [database_url.host, database_url.username, database_url.password, database_url.database]
        ):
            raise ValueError('Supabase host, database, user, and password must be nonempty')
        if database_url.port == 6543:
            raise ValueError('Use a direct connection or Supabase session pooler on port 5432')
        return self

    def database_connection_url(self) -> URL:
        if self.supabase_database_url is not None:
            database_url = make_url(self.supabase_database_url.get_secret_value())
            if database_url.drivername not in {'postgres', 'postgresql', 'postgresql+psycopg'}:
                raise ValueError('SUPABASE_DATABASE_URL must use PostgreSQL with psycopg')
            if set(database_url.query) - {'sslmode', 'sslrootcert'}:
                raise ValueError('Only sslmode and sslrootcert URL options are supported')
            ssl_mode = database_url.query.get('sslmode', self.supabase_db_sslmode)
            if ssl_mode not in {'require', 'verify-ca', 'verify-full'}:
                raise ValueError('Supabase database connections require TLS')
            return database_url.set(drivername='postgresql+psycopg').update_query_dict(
                {'sslmode': ssl_mode}
            )
        return URL.create(
            'postgresql+psycopg',
            username=self.supabase_db_user,
            password=(
                self.supabase_db_password.get_secret_value() if self.supabase_db_password else None
            ),
            host=self.supabase_db_host,
            port=self.supabase_db_port,
            database=self.supabase_db_name,
            query={'sslmode': self.supabase_db_sslmode},
        )

    @field_validator('cors_origins', 'allowed_hosts')
    @classmethod
    def reject_wildcards(cls, value: list[str]) -> list[str]:
        if not value or any('*' in item for item in value):
            raise ValueError('Explicit origins/hosts are required; wildcards are not allowed')
        return value
