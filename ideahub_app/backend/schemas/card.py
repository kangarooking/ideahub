"""Pydantic schemas for card requests and responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CardCreate(BaseModel):
    """Schema for creating a new card."""

    card_type: str  # "text" | "link" | "screenshot" | "inspiration"
    title: str | None = None
    content: str
    source_url: str | None = None
    source_platform: str | None = None
    user_note: str | None = None
    user_tags: str | None = None  # JSON string


class CardUpdate(BaseModel):
    """Schema for updating an existing card. All fields are optional."""

    title: str | None = None
    content: str | None = None
    user_note: str | None = None
    user_tags: str | None = None  # JSON string


class CardResponse(BaseModel):
    """Schema for card response with all fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    card_type: str
    title: str | None
    content: str
    parsed_content: str | None
    cover_image: str | None
    source_url: str | None
    source_platform: str | None
    video_url: str | None
    ai_summary: str | None
    ai_tags: str | None
    ai_suggestions: str | None
    user_tags: str | None
    user_note: str | None
    screenshot_path: str | None
    is_ai_processed: bool
    created_at: datetime
    updated_at: datetime


class CardListResponse(BaseModel):
    """Schema for paginated card list response."""

    items: list[CardResponse]
    total: int
    page: int
    page_size: int


# Link parsing related schemas
class LinkParseRequest(BaseModel):
    """Schema for link parsing request."""

    url: str


class LinkParseResponse(BaseModel):
    """Schema for link parsing response."""

    title: str | None
    description: str | None
    cover_image: str | None
    content: str | None
    source_url: str
    success: bool = True
    error: str | None = None
