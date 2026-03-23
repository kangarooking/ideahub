"""AI API routes for model configuration and content processing."""

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models import AIModelConfig, MaterialCard
from ..database.session import get_db
from ..schemas.ai import (
    AIBatchProcessRequest,
    AIBatchProcessResponse,
    AIModelConfigCreate,
    AIModelConfigResponse,
    AIModelConfigUpdate,
    AIProcessRequest,
    AIProcessResponse,
    AvailableModel,
    FetchModelsRequest,
    FetchModelsResponse,
)
from ..services.ai import ProviderRegistry

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/models", response_model=list[AIModelConfigResponse])
async def get_all_models(
    db: AsyncSession = Depends(get_db),
) -> list[AIModelConfigResponse]:
    """Get all AI model configurations."""
    result = await db.execute(select(AIModelConfig).order_by(AIModelConfig.id))
    configs = result.scalars().all()
    return [AIModelConfigResponse.model_validate(c) for c in configs]


@router.post("/models", response_model=AIModelConfigResponse)
async def create_model(
    config: AIModelConfigCreate,
    db: AsyncSession = Depends(get_db),
) -> AIModelConfigResponse:
    """Add a custom AI model configuration (is_preset=False)."""
    if config.provider_type not in ("openai", "anthropic"):
        raise HTTPException(
            status_code=400,
            detail="Invalid provider_type. Must be 'openai' or 'anthropic'.",
        )

    model_config = AIModelConfig(
        name=config.name,
        provider_type=config.provider_type,
        base_url=config.base_url,
        api_key=config.api_key,
        model_name=config.model_name,
        is_active=False,
        is_preset=False,
    )
    db.add(model_config)
    await db.commit()
    await db.refresh(model_config)
    return AIModelConfigResponse.model_validate(model_config)


@router.put("/models/{model_id}", response_model=AIModelConfigResponse)
async def update_model(
    model_id: int,
    config: AIModelConfigUpdate,
    db: AsyncSession = Depends(get_db),
) -> AIModelConfigResponse:
    """Update an AI model configuration (mainly for updating api_key)."""
    result = await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_id))
    model_config = result.scalar_one_or_none()

    if model_config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    # Update only provided fields
    if config.name is not None:
        model_config.name = config.name
    if config.base_url is not None:
        model_config.base_url = config.base_url
    if config.api_key is not None:
        model_config.api_key = config.api_key
    if config.model_name is not None:
        model_config.model_name = config.model_name

    await db.commit()
    await db.refresh(model_config)
    return AIModelConfigResponse.model_validate(model_config)


@router.delete("/models/{model_id}")
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete an AI model configuration (preset models cannot be deleted)."""
    result = await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_id))
    model_config = result.scalar_one_or_none()

    if model_config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    if model_config.is_preset:
        raise HTTPException(
            status_code=400,
            detail="Preset models cannot be deleted.",
        )

    await db.delete(model_config)
    await db.commit()
    return {"message": "Model configuration deleted successfully."}


@router.put("/models/{model_id}/activate", response_model=AIModelConfigResponse)
async def activate_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
) -> AIModelConfigResponse:
    """Set a model as the active model (deactivates other models)."""
    result = await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_id))
    model_config = result.scalar_one_or_none()

    if model_config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    # Deactivate all other models
    await db.execute(
        update(AIModelConfig).where(AIModelConfig.id != model_id).values(is_active=False)
    )

    # Activate the selected model
    model_config.is_active = True
    await db.commit()
    await db.refresh(model_config)
    return AIModelConfigResponse.model_validate(model_config)


@router.post("/models/{model_id}/fetch-available-models", response_model=FetchModelsResponse)
async def fetch_available_models_by_id(
    model_id: int,
    db: AsyncSession = Depends(get_db),
) -> FetchModelsResponse:
    """Fetch available models for a saved model configuration.
    
    Uses the saved model's provider_type, base_url, and api_key to query available models.
    For OpenAI-compatible providers, queries the /models endpoint.
    For Anthropic, returns a fallback list of known models.
    """
    result = await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_id))
    model_config = result.scalar_one_or_none()

    if model_config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    if not model_config.api_key:
        raise HTTPException(
            status_code=400,
            detail="API key not configured. Please set an API key first.",
        )

    models, source = await ProviderRegistry.fetch_available_models(
        model_config.provider_type,
        model_config.base_url,
        model_config.api_key,
    )

    return FetchModelsResponse(
        models=[AvailableModel(**m) for m in models],
        source=source,
    )


@router.post("/fetch-models", response_model=FetchModelsResponse)
async def fetch_available_models(
    request: FetchModelsRequest,
) -> FetchModelsResponse:
    """Fetch available models without requiring a saved configuration.
    
    Useful when user wants to preview available models before saving a configuration.
    For OpenAI-compatible providers, queries the /models endpoint.
    For Anthropic, returns a fallback list of known models.
    """
    if request.provider_type not in ("openai", "anthropic"):
        raise HTTPException(
            status_code=400,
            detail="Invalid provider_type. Must be 'openai' or 'anthropic'.",
        )

    models, source = await ProviderRegistry.fetch_available_models(
        request.provider_type,
        request.base_url,
        request.api_key,
    )

    return FetchModelsResponse(
        models=[AvailableModel(**m) for m in models],
        source=source,
    )


async def _process_card(
    card: MaterialCard,
    actions: list[str],
    db: AsyncSession,
) -> AIProcessResponse:
    """Internal function to process a single card with AI.
    
    Args:
        card: The card to process.
        actions: List of actions to perform.
        db: Database session.
        
    Returns:
        AI processing response.
        
    Raises:
        ValueError: If no active model or API key missing.
        httpx.HTTPStatusError: If API request fails.
    """
    # Get active provider
    provider = await ProviderRegistry.get_active_provider(db)

    # Get content for processing
    content = card.parsed_content or card.content
    if not content:
        raise ValueError("Card has no content to process.")

    response = AIProcessResponse(card_id=card.id)

    # Execute requested actions
    if "summarize" in actions:
        response.ai_summary = await provider.summarize(content)
        card.ai_summary = response.ai_summary

    if "extract_tags" in actions:
        tags = await provider.extract_tags(content)
        response.ai_tags = tags
        card.ai_tags = json.dumps(tags, ensure_ascii=False)

    if "suggest_ideas" in actions:
        response.ai_suggestions = await provider.suggest_ideas(content)
        card.ai_suggestions = response.ai_suggestions

    # Mark as AI processed
    card.is_ai_processed = True

    return response


@router.post("/process/{card_id}", response_model=AIProcessResponse)
async def process_card(
    card_id: int,
    request: AIProcessRequest = AIProcessRequest(),
    db: AsyncSession = Depends(get_db),
) -> AIProcessResponse:
    """Process a card with AI to generate summary, tags, and suggestions."""
    # Get the card
    result = await db.execute(select(MaterialCard).where(MaterialCard.id == card_id))
    card = result.scalar_one_or_none()

    if card is None:
        raise HTTPException(status_code=404, detail="Card not found.")

    try:
        response = await _process_card(card, request.actions, db)
        await db.commit()
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI API request failed: {e.response.status_code} - {e.response.text}",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="AI API request timed out. Please try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI processing failed: {str(e)}",
        )


@router.post("/process/batch", response_model=AIBatchProcessResponse)
async def batch_process_cards(
    request: AIBatchProcessRequest,
    db: AsyncSession = Depends(get_db),
) -> AIBatchProcessResponse:
    """Batch process multiple cards with AI."""
    results: list[AIProcessResponse] = []
    failed_ids: list[int] = []
    errors: dict[int, str] = {}

    # Get all cards
    result = await db.execute(
        select(MaterialCard).where(MaterialCard.id.in_(request.card_ids))
    )
    cards = {card.id: card for card in result.scalars().all()}

    for card_id in request.card_ids:
        card = cards.get(card_id)
        if card is None:
            failed_ids.append(card_id)
            errors[card_id] = "Card not found."
            continue

        try:
            response = await _process_card(card, request.actions, db)
            results.append(response)
        except ValueError as e:
            failed_ids.append(card_id)
            errors[card_id] = str(e)
        except httpx.HTTPStatusError as e:
            failed_ids.append(card_id)
            errors[card_id] = f"AI API error: {e.response.status_code}"
        except httpx.TimeoutException:
            failed_ids.append(card_id)
            errors[card_id] = "AI API request timed out."
        except Exception as e:
            failed_ids.append(card_id)
            errors[card_id] = f"Processing failed: {str(e)}"

    # Commit all successful changes
    await db.commit()

    return AIBatchProcessResponse(
        results=results,
        failed_ids=failed_ids,
        errors=errors,
    )
