"""Card CRUD API routes."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.session import async_session_maker, get_db
from ..schemas.card import CardCreate, CardListResponse, CardResponse, CardUpdate
from ..services.ai.provider_registry import ProviderRegistry
from ..services.ai_search import ai_search_service
from ..services.card_service import CardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


@router.post("", response_model=CardResponse, status_code=201)
async def create_card(
    card_data: CardCreate, db: AsyncSession = Depends(get_db)
) -> CardResponse:
    """Create a new material card."""
    card = await CardService.create_card(db, card_data)
    return CardResponse.model_validate(card)


@router.get("", response_model=CardListResponse)
async def get_cards(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(None, description="全文搜索关键词"),
    tag: str | None = Query(None, description="标签筛选"),
    card_type: str | None = Query(None, description="素材类型筛选: text|link|screenshot|inspiration"),
    sort_by: str = Query("created_at", description="排序字段"),
    order: str = Query("desc", description="排序方向: asc|desc"),
    db: AsyncSession = Depends(get_db),
) -> CardListResponse:
    """Get paginated list of cards with search, filter and sort."""
    items, total = await CardService.get_cards(
        db,
        page=page,
        page_size=page_size,
        search=search,
        tag=tag,
        card_type=card_type,
        sort_by=sort_by,
        order=order,
    )
    return CardListResponse(
        items=[CardResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/ai-search")
async def ai_search(
    q: str = Query(..., min_length=1, max_length=500, description="自然语言搜索查询"),
):
    """AI semantic search endpoint with SSE streaming progress."""
    
    async def event_generator():
        # 在生成器内手动创建数据库会话，因为 SSE 需要跨越整个流的生命周期
        async with async_session_maker() as db:
            try:
                # 获取 provider
                provider = await ProviderRegistry.get_active_provider(db)
                if provider is None:
                    yield f"event: error\ndata: {json.dumps({'message': '没有配置活跃的 AI 模型，请先在设置中配置'}, ensure_ascii=False)}\n\n"
                    return

                # 阶段 1: 查询理解
                yield f"event: stage\ndata: {json.dumps({'stage': 'expanding', 'message': '正在分析搜索意图...'}, ensure_ascii=False)}\n\n"
                
                expanded = await ai_search_service.expand_query(q, provider)
                
                yield f"event: stage\ndata: {json.dumps({'stage': 'expanded', 'message': '已理解搜索意图', 'keywords': expanded}, ensure_ascii=False)}\n\n"

                # 阶段 2: SQL 检索
                yield f"event: stage\ndata: {json.dumps({'stage': 'retrieving', 'message': '正在检索候选素材...'}, ensure_ascii=False)}\n\n"
                
                all_keywords = [q] + expanded
                candidates = await ai_search_service.retrieve_candidates(all_keywords, db, limit=20)
                if len(candidates) < 3:
                    candidates = await ai_search_service.get_all_cards_brief(db, limit=30)
                
                yield f"event: stage\ndata: {json.dumps({'stage': 'retrieved', 'message': f'找到 {len(candidates)} 个候选素材', 'count': len(candidates)}, ensure_ascii=False)}\n\n"

                if not candidates:
                    yield f"event: done\ndata: {json.dumps({'items': [], 'query': q, 'expanded_keywords': expanded, 'total': 0}, ensure_ascii=False)}\n\n"
                    return

                # 阶段 3: LLM 重排序
                yield f"event: stage\ndata: {json.dumps({'stage': 'reranking', 'message': 'AI 正在对结果进行语义排序...'}, ensure_ascii=False)}\n\n"
                
                ranked = await ai_search_service.rerank(q, candidates, provider)
                
                # 获取完整卡片
                ranked_ids = [r["id"] for r in ranked]
                full_cards = await ai_search_service.get_full_cards(ranked_ids, db)
                
                items = []
                for rank_info in ranked:
                    card_data = full_cards.get(rank_info["id"])
                    if card_data:
                        card_data["relevance_score"] = rank_info["score"]
                        card_data["relevance_reason"] = rank_info.get("reason", "")
                        items.append(card_data)
                
                result = {
                    "items": items,
                    "query": q,
                    "expanded_keywords": expanded,
                    "total": len(items),
                }
                yield f"event: done\ndata: {json.dumps(result, ensure_ascii=False, default=str)}\n\n"

            except Exception as e:
                logger.error(f"AI search SSE error: {e}")
                yield f"event: error\ndata: {json.dumps({'message': f'AI 搜索失败: {str(e)}'}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tags")
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    """获取所有已使用的标签"""
    tags = await CardService.get_all_tags(db)
    return {"tags": tags}


@router.get("/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: int, db: AsyncSession = Depends(get_db)
) -> CardResponse:
    """Get a single card by ID."""
    card = await CardService.get_card(db, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardResponse.model_validate(card)


@router.put("/{card_id}", response_model=CardResponse)
async def update_card(
    card_id: int, card_data: CardUpdate, db: AsyncSession = Depends(get_db)
) -> CardResponse:
    """Update an existing card."""
    card = await CardService.update_card(db, card_id, card_data)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardResponse.model_validate(card)


@router.delete("/{card_id}", status_code=204)
async def delete_card(card_id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a card by ID."""
    success = await CardService.delete_card(db, card_id)
    if not success:
        raise HTTPException(status_code=404, detail="Card not found")
