"""Card business logic service."""

import json

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models import MaterialCard
from ..schemas.card import CardCreate, CardUpdate


class CardService:
    """Service class for card CRUD operations."""

    @staticmethod
    async def create_card(db: AsyncSession, card_data: CardCreate) -> MaterialCard:
        """Create a new material card."""
        card = MaterialCard(
            card_type=card_data.card_type,
            title=card_data.title,
            content=card_data.content,
            source_url=card_data.source_url,
            source_platform=card_data.source_platform,
            user_note=card_data.user_note,
            user_tags=card_data.user_tags,
        )
        db.add(card)
        await db.flush()
        await db.refresh(card)
        return card

    @staticmethod
    async def get_card(db: AsyncSession, card_id: int) -> MaterialCard | None:
        """Get a single card by ID."""
        result = await db.execute(
            select(MaterialCard).where(MaterialCard.id == card_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_cards(
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        tag: str | None = None,
        card_type: str | None = None,
        sort_by: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[MaterialCard], int]:
        """Get paginated list of cards with search, filter and sort."""
        # Build base query
        query = select(MaterialCard)
        count_query = select(func.count(MaterialCard.id))

        # Apply search filter
        if search:
            search_pattern = f"%{search}%"
            search_conditions = or_(
                MaterialCard.title.ilike(search_pattern),
                MaterialCard.content.ilike(search_pattern),
                MaterialCard.parsed_content.ilike(search_pattern),
                MaterialCard.ai_summary.ilike(search_pattern),
            )
            query = query.where(search_conditions)
            count_query = count_query.where(search_conditions)

        # Apply tag filter
        if tag:
            tag_pattern = f'%"{tag}"%'
            tag_conditions = or_(
                MaterialCard.ai_tags.like(tag_pattern),
                MaterialCard.user_tags.like(tag_pattern),
            )
            query = query.where(tag_conditions)
            count_query = count_query.where(tag_conditions)

        # Apply card_type filter
        if card_type:
            query = query.where(MaterialCard.card_type == card_type)
            count_query = count_query.where(MaterialCard.card_type == card_type)

        # Get total count
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply sorting
        sort_column = getattr(MaterialCard, sort_by, MaterialCard.created_at)
        order_func = desc if order == "desc" else asc
        query = query.order_by(order_func(sort_column))

        # Apply pagination
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        items = list(result.scalars().all())

        return items, total

    @staticmethod
    async def get_all_tags(db: AsyncSession) -> list[str]:
        """Get all unique tags from ai_tags and user_tags."""
        result = await db.execute(
            select(MaterialCard.ai_tags, MaterialCard.user_tags)
        )
        rows = result.all()

        all_tags: set[str] = set()
        for ai_tags, user_tags in rows:
            # Parse ai_tags
            if ai_tags:
                try:
                    tags = json.loads(ai_tags)
                    if isinstance(tags, list):
                        all_tags.update(str(t) for t in tags if t)
                except json.JSONDecodeError:
                    pass
            # Parse user_tags
            if user_tags:
                try:
                    tags = json.loads(user_tags)
                    if isinstance(tags, list):
                        all_tags.update(str(t) for t in tags if t)
                except json.JSONDecodeError:
                    pass

        return sorted(all_tags)

    @staticmethod
    async def update_card(
        db: AsyncSession, card_id: int, card_data: CardUpdate
    ) -> MaterialCard | None:
        """Update an existing card."""
        card = await CardService.get_card(db, card_id)
        if not card:
            return None

        # Update only provided fields
        update_data = card_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                setattr(card, field, value)

        await db.flush()
        await db.refresh(card)
        return card

    @staticmethod
    async def delete_card(db: AsyncSession, card_id: int) -> bool:
        """Delete a card by ID."""
        card = await CardService.get_card(db, card_id)
        if not card:
            return False

        await db.delete(card)
        await db.flush()
        return True
