from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MicroSuite"
    app_url: str = "http://localhost:5173"  # URL pública del frontend (sin / final)
    secret_key: str = "change-me"
    access_token_minutes: int = 60 * 24 * 7
    database_url: str = "postgresql+psycopg://suite:suite@localhost:5432/suite"
    cors_origins: str = "http://localhost:5173"
    timezone: str = "America/Bogota"
    trial_days: int = 14

    # PayPal: mode = mock | sandbox | live
    paypal_mode: str = "mock"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_brand_name: str = "MicroSuite"

    # Correo (SMTP). Si smtp_host está vacío, los correos se imprimen en el log.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "MicroSuite <no-reply@example.com>"
    smtp_tls: bool = True

    # WhatsApp Cloud API (opcional)
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""
    whatsapp_template: str = "alerta_generica"
    whatsapp_lang: str = "es"

    # Microsoft 365: app multi-tenant de solo lectura (LicenciaLens) y de administración (OffboardKit)
    m365_read_client_id: str = ""
    m365_read_client_secret: str = ""
    m365_admin_client_id: str = ""
    m365_admin_client_secret: str = ""

    # Dominios propios por producto: "licencialens.com=licencialens,venceya.app=venceya"
    product_domains: str = ""

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def domain_map(self) -> dict[str, str]:
        out = {}
        for pair in self.product_domains.split(","):
            if "=" in pair:
                d, slug = pair.split("=", 1)
                out[d.strip().lower()] = slug.strip()
        return out


@lru_cache
def get_settings() -> Settings:
    return Settings()
