"""SQLAlchemy ORM models."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    pass


class MaterialCard(Base):
    """Material card model for storing various types of content."""

    __tablename__ = "material_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    card_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "text" | "link" | "screenshot" | "inspiration"
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # 原始内容
    parsed_content: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # 解析后的正文
    cover_image: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )  # 封面图路径或URL
    source_url: Mapped[str | None] = mapped_column(
        String(2000), nullable=True
    )  # 来源链接
    source_platform: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # 来源平台
    video_url: Mapped[str | None] = mapped_column(
        String(2000), nullable=True
    )  # 视频下载链接
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI 摘要
    ai_tags: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON string，AI 标签列表
    ai_suggestions: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # AI 灵感建议
    user_tags: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON string，用户标签
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 用户备注
    screenshot_path: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )  # 截图文件路径
    is_ai_processed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # 默认 False
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), nullable=False
    )  # 默认 utcnow
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )  # 自动更新

    def __repr__(self) -> str:
        return f"<MaterialCard(id={self.id}, type={self.card_type}, title={self.title})>"


class AIModelConfig(Base):
    """AI model configuration for multi-provider support."""

    __tablename__ = "ai_model_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # Display name, e.g., "ChatGPT-4o-mini"
    provider_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "openai" | "anthropic"
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)  # API base URL
    api_key: Mapped[str] = mapped_column(
        String(500), default="", nullable=False
    )  # API key (can be empty, to be filled by user)
    model_name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # Model identifier, e.g., "gpt-4o-mini"
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # Whether this is the currently active model
    is_preset: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )  # Whether this is a preset model
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AIModelConfig(id={self.id}, name={self.name}, active={self.is_active})>"
