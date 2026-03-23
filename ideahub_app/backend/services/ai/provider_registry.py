"""Provider registry and factory for AI models."""

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database.models import AIModelConfig
from .base import AIProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider


# Anthropic known models (fallback list since Anthropic doesn't have a /models endpoint)
ANTHROPIC_KNOWN_MODELS = [
    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
    {"id": "claude-opus-4-20250514", "name": "Claude Opus 4"},
    {"id": "claude-3-7-sonnet-20250219", "name": "Claude 3.7 Sonnet"},
    {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
    {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet v2"},
    {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
]

# Fallback models for known providers (used when API query fails)
PROVIDER_FALLBACK_MODELS = {
    "https://api.openai.com/v1": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
    ],
    "https://open.bigmodel.cn/api/paas/v4": [
        {"id": "glm-4-plus", "name": "GLM-4 Plus"},
        {"id": "glm-4-flash", "name": "GLM-4 Flash"},
        {"id": "glm-4-long", "name": "GLM-4 Long"},
        {"id": "glm-4v-plus", "name": "GLM-4V Plus (视觉)"},
    ],
    "https://api.moonshot.cn/v1": [
        {"id": "moonshot-v1-8k", "name": "Moonshot V1 8K"},
        {"id": "moonshot-v1-32k", "name": "Moonshot V1 32K"},
        {"id": "moonshot-v1-128k", "name": "Moonshot V1 128K"},
    ],
    "https://api.minimax.chat/v1": [
        {"id": "MiniMax-Text-01", "name": "MiniMax Text 01"},
        {"id": "abab6.5s-chat", "name": "ABAB 6.5s Chat"},
    ],
    "https://dashscope.aliyuncs.com/compatible-mode/v1": [
        {"id": "qwen-plus", "name": "Qwen Plus"},
        {"id": "qwen-turbo", "name": "Qwen Turbo"},
        {"id": "qwen-max", "name": "Qwen Max"},
        {"id": "qwen-vl-plus", "name": "Qwen VL Plus (视觉)"},
    ],
    "https://generativelanguage.googleapis.com/v1beta/openai": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
    ],
}


class ProviderRegistry:
    """Registry for AI model configurations and provider factory."""

    # Preset model configurations
    PRESETS = [
        {
            "name": "ChatGPT",
            "provider_type": "openai",
            "base_url": "https://api.openai.com/v1",
            "model_name": "gpt-4o-mini",
        },
        {
            "name": "GLM (智谱)",
            "provider_type": "openai",
            "base_url": "https://open.bigmodel.cn/api/paas/v4",
            "model_name": "glm-4-flash",
        },
        {
            "name": "Kimi (月之暗面)",
            "provider_type": "openai",
            "base_url": "https://api.moonshot.cn/v1",
            "model_name": "moonshot-v1-8k",
        },
        {
            "name": "MiniMax",
            "provider_type": "openai",
            "base_url": "https://api.minimax.chat/v1",
            "model_name": "MiniMax-Text-01",
        },
        {
            "name": "Qwen (通义千问)",
            "provider_type": "openai",
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model_name": "qwen-plus",
        },
        {
            "name": "Gemini",
            "provider_type": "openai",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
            "model_name": "gemini-2.0-flash",
        },
        {
            "name": "Claude",
            "provider_type": "anthropic",
            "base_url": "https://api.anthropic.com/v1",
            "model_name": "claude-sonnet-4-20250514",
        },
    ]

    @staticmethod
    async def init_presets(db_session: AsyncSession) -> None:
        """Initialize preset model configurations (only if table is empty).
        
        Args:
            db_session: Database session.
        """
        # Check if presets already exist
        result = await db_session.execute(
            select(AIModelConfig).where(AIModelConfig.is_preset == True).limit(1)
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            # Presets already initialized
            return

        # Insert all presets
        for preset in ProviderRegistry.PRESETS:
            config = AIModelConfig(
                name=preset["name"],
                provider_type=preset["provider_type"],
                base_url=preset["base_url"],
                api_key="",
                model_name=preset["model_name"],
                is_active=False,
                is_preset=True,
            )
            db_session.add(config)

        await db_session.commit()

    @staticmethod
    def create_provider(config: AIModelConfig) -> AIProvider:
        """Create a provider instance based on the configuration.
        
        Args:
            config: AI model configuration.
            
        Returns:
            An AI provider instance.
            
        Raises:
            ValueError: If the provider type is unknown.
        """
        if config.provider_type == "openai":
            return OpenAIProvider(config.base_url, config.api_key, config.model_name)
        elif config.provider_type == "anthropic":
            return AnthropicProvider(config.base_url, config.api_key, config.model_name)
        raise ValueError(f"Unknown provider type: {config.provider_type}")

    @staticmethod
    async def get_active_provider(db_session: AsyncSession) -> AIProvider:
        """Get the currently active AI provider.
        
        Args:
            db_session: Database session.
            
        Returns:
            The active AI provider.
            
        Raises:
            ValueError: If no active model is configured or API key is missing.
        """
        result = await db_session.execute(
            select(AIModelConfig).where(AIModelConfig.is_active == True)
        )
        config = result.scalar_one_or_none()

        if config is None:
            raise ValueError("No active AI model configured. Please activate a model first.")

        if not config.api_key:
            raise ValueError(
                f"API key not configured for model '{config.name}'. "
                "Please update the model configuration with a valid API key."
            )

        return ProviderRegistry.create_provider(config)

    @staticmethod
    async def get_active_config(db_session: AsyncSession) -> AIModelConfig | None:
        """Get the currently active AI model configuration.
        
        Args:
            db_session: Database session.
            
        Returns:
            The active AI model configuration or None.
        """
        result = await db_session.execute(
            select(AIModelConfig).where(AIModelConfig.is_active == True)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def fetch_available_models(
        provider_type: str, base_url: str, api_key: str
    ) -> tuple[list[dict], str]:
        """Fetch available models from a provider.
        
        Args:
            provider_type: The provider type ("openai" or "anthropic").
            base_url: The API base URL.
            api_key: The API key.
            
        Returns:
            A tuple of (models_list, source) where source is "api", "fallback", or "error".
        """
        if provider_type == "anthropic":
            # Anthropic doesn't have a /models endpoint, use fallback
            return ANTHROPIC_KNOWN_MODELS, "fallback"

        if provider_type == "openai":
            # Try to fetch from API first
            try:
                models = await _fetch_openai_models(base_url, api_key)
                if models:
                    return models, "api"
            except Exception:
                pass

            # Try fallback for known providers
            normalized_url = base_url.rstrip("/")
            fallback = PROVIDER_FALLBACK_MODELS.get(normalized_url, [])
            if fallback:
                return fallback, "fallback"

            return [], "error"

        return [], "unknown"


async def _fetch_openai_models(base_url: str, api_key: str) -> list[dict]:
    """Fetch models from OpenAI-compatible API.
    
    Args:
        base_url: The API base URL.
        api_key: The API key.
        
    Returns:
        List of model dicts with 'id' and 'name' keys.
    """
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        # Handle different response formats from various providers
        models_data: list = []
        if isinstance(data, list):
            # Some providers return a plain list
            models_data = data
        elif isinstance(data, dict):
            # OpenAI format: {"data": [...]}
            if "data" in data:
                models_data = data["data"]
            # Some providers: {"models": [...]}
            elif "models" in data:
                models_data = data["models"]

        # Extract model info, filter out non-chat models if possible
        result = []
        for m in models_data:
            if isinstance(m, dict) and "id" in m:
                model_id = m["id"]
                # Filter out embedding, tts, whisper, dall-e models
                skip_keywords = ["embedding", "tts", "whisper", "dall-e", "davinci", "babbage", "curie", "ada"]
                if any(kw in model_id.lower() for kw in skip_keywords):
                    continue
                result.append({"id": model_id, "name": m.get("name", model_id)})

        # Sort by id
        result.sort(key=lambda x: x["id"])
        return result
