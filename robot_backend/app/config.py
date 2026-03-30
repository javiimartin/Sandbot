"""
Configuración centralizada de la aplicación.
Usa variables de entorno cuando estén disponibles,
con valores por defecto para desarrollo local.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # CORS
    allowed_origins: list[str] = ["*"]

    # App
    app_title: str       = "Wizard of Oz — Backend"
    app_version: str     = "0.1.0"
    debug: bool          = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Instancia global — importar desde aquí en el resto de módulos
settings = Settings()