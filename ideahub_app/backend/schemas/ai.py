"""Pydantic schemas for AI-related requests and responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class AIModelConfigCreate(BaseModel):
    """Schema for creating a new AI model configuration."""

    name: str
    provider_type: str  # "openai" | "anthropic"
    base_url: str
    api_key: str = ""
    model_name: str


class AIModelConfigUpdate(BaseModel):
    """Schema for updating an AI model configuration."""

    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None


class AIModelConfigResponse(BaseModel):
    """Schema for AI model configuration response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    provider_type: str
    base_url: str
    api_key: str  # Will be masked in serialization
    model_name: str
    is_active: bool
    is_preset: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("api_key", mode="after")
    @classmethod
    def mask_api_key(cls, v: str) -> str:
        """Mask API key to show only last 4 characters."""
        if not v:
            return ""
        if len(v) <= 4:
            return "****"
        return "****" + v[-4:]


class AIProcessRequest(BaseModel):
    """Schema for AI processing request."""

    actions: list[str] = ["summarize", "extract_tags", "suggest_ideas"]


class AIProcessResponse(BaseModel):
    """Schema for AI processing response."""

    card_id: int
    ai_summary: str | None = None
    ai_tags: list[str] | None = None
    ai_suggestions: str | None = None


class AIBatchProcessRequest(BaseModel):
    """Schema for batch AI processing request."""

    card_ids: list[int]
    actions: list[str] = ["summarize", "extract_tags", "suggest_ideas"]


class AIBatchProcessResponse(BaseModel):
    """Schema for batch AI processing response."""

    results: list[AIProcessResponse]
    failed_ids: list[int] = []
    errors: dict[int, str] = {}  # card_id -> error message


class FetchModelsRequest(BaseModel):
    """Schema for fetching available models from a provider."""

    provider_type: str  # "openai" | "anthropic"
    base_url: str
    api_key: str


class AvailableModel(BaseModel):
    """Schema for an available model."""

    id: str
    name: str


class FetchModelsResponse(BaseModel):
    """Schema for fetch models response."""

    models: list[AvailableModel]
    source: str  # "api" | "fallback" | "error"
