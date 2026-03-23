"""AI semantic search service using Retrieve-then-Rerank pattern."""

import asyncio
import json
import logging
import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models import MaterialCard
from .ai.prompts import QUERY_EXPANSION_PROMPT, SEMANTIC_RERANK_PROMPT
from .ai.provider_registry import ProviderRegistry

logger = logging.getLogger(__name__)


class AISearchService:
    """Three-stage semantic search: Query Expansion → SQL Retrieval → LLM Reranking."""

    EXPAND_TIMEOUT = 15  # 查询理解超时（秒）
    RERANK_TIMEOUT = 60  # 重排序超时（秒）- 增加到 60 秒以适应大量候选

    def _parse_json_array(self, text: str) -> list | None:
        """Robustly parse JSON array from LLM response.
        
        Handles:
        - Markdown code blocks (```json ... ``` or ``` ... ```)
        - Leading/trailing text outside JSON
        - Common LLM response variations
        """
        if not text:
            return None
        text = text.strip()
        
        # 清理 markdown 代码块（支持 ```json 或 ```）
        if "```" in text:
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL | re.IGNORECASE)
            if match:
                text = match.group(1).strip()
        
        # 找 JSON 数组边界
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError as e:
                logger.debug(f"JSON parse failed: {e}, text: {text[start:end][:200]}")
        return None

    async def semantic_search(self, query: str, db: AsyncSession) -> dict:
        """Execute three-stage semantic search pipeline.
        
        Returns dict with: items, query, expanded_keywords, total
        """
        # 获取活跃的 AI 模型
        provider = await ProviderRegistry.get_active_provider(db)

        # 阶段 1: 查询理解 - 扩展关键词
        expanded_keywords = await self.expand_query(query, provider)

        # 阶段 2: SQL 扩展检索
        all_keywords = [query] + expanded_keywords
        candidates = await self.retrieve_candidates(all_keywords, db, limit=20)

        # 如果候选太少，降级为全量搜索
        if len(candidates) < 3:
            candidates = await self.get_all_cards_brief(db, limit=30)

        if not candidates:
            return {
                "items": [],
                "query": query,
                "expanded_keywords": expanded_keywords,
                "total": 0,
            }

        # 阶段 3: LLM 重排序
        ranked_results = await self.rerank(query, candidates, provider)

        # 获取完整卡片数据
        ranked_ids = [r["id"] for r in ranked_results]
        full_cards = await self.get_full_cards(ranked_ids, db)

        # 合并排序信息到卡片数据
        items = []
        for rank_info in ranked_results:
            card_data = full_cards.get(rank_info["id"])
            if card_data:
                card_data["relevance_score"] = rank_info["score"]
                card_data["relevance_reason"] = rank_info.get("reason", "")
                items.append(card_data)

        return {
            "items": items,
            "query": query,
            "expanded_keywords": expanded_keywords,
            "total": len(items),
        }

    async def expand_query(self, query: str, provider) -> list[str]:
        """Stage 1: Use LLM to expand query into related keywords."""
        logger.info(f"[expand_query] Starting for query: {query}")
        try:
            prompt = QUERY_EXPANSION_PROMPT.format(query=query)
            messages = [{"role": "user", "content": prompt}]

            response = await asyncio.wait_for(
                provider.chat(messages, temperature=0.3), timeout=self.EXPAND_TIMEOUT
            )
            logger.debug(f"[expand_query] Raw LLM response: {response[:500]}")

            # 使用健壮的 JSON 解析
            keywords = self._parse_json_array(response)
            if keywords and isinstance(keywords, list):
                result = [str(k) for k in keywords[:8]]
                logger.info(f"[expand_query] Expanded keywords: {result}")
                return result

            logger.warning(f"[expand_query] Failed to parse response: {response[:200]}")
            return []

        except asyncio.TimeoutError:
            logger.warning("[expand_query] Timed out")
            return []
        except Exception as e:
            logger.warning(f"[expand_query] Failed: {e}")
            return []

    async def retrieve_candidates(
        self, keywords: list[str], db: AsyncSession, limit: int = 30
    ) -> list[dict]:
        """Stage 2: SQL LIKE search with expanded keywords."""
        logger.info(f"[retrieve_candidates] Searching with {len(keywords)} keywords: {keywords}")
        conditions = []
        for kw in keywords:
            pattern = f"%{kw}%"
            conditions.append(MaterialCard.title.ilike(pattern))
            conditions.append(MaterialCard.content.ilike(pattern))
            conditions.append(MaterialCard.ai_summary.ilike(pattern))
            conditions.append(MaterialCard.ai_tags.ilike(pattern))
            conditions.append(MaterialCard.user_tags.ilike(pattern))

        stmt = (
            select(MaterialCard)
            .where(or_(*conditions))
            .order_by(MaterialCard.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        cards = result.scalars().all()
        briefs = [self._card_to_brief(card) for card in cards]
        logger.info(f"[retrieve_candidates] Found {len(briefs)} candidates")
        return briefs

    async def get_all_cards_brief(
        self, db: AsyncSession, limit: int = 50
    ) -> list[dict]:
        """Fallback: get all cards for small datasets."""
        logger.info(f"[get_all_cards_brief] Fetching all cards (limit={limit})")
        stmt = (
            select(MaterialCard)
            .order_by(MaterialCard.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        cards = result.scalars().all()
        briefs = [self._card_to_brief(card) for card in cards]
        logger.info(f"[get_all_cards_brief] Got {len(briefs)} cards")
        return briefs

    def _card_to_brief(self, card: MaterialCard) -> dict:
        """Convert card to brief dict for LLM consumption."""
        return {
            "id": card.id,
            "title": card.title or "(无标题)",
            "type": card.card_type,
            "summary": (card.ai_summary or card.content or "")[:350],  # 增加摘要长度
            "tags": card.ai_tags or card.user_tags or "",
        }

    async def rerank(
        self, query: str, candidates: list[dict], provider
    ) -> list[dict]:
        """Stage 3: Use LLM to rerank candidates by semantic relevance."""
        logger.info(f"[rerank] Starting with {len(candidates)} candidates for query: {query}")
        try:
            candidates_json = json.dumps(candidates, ensure_ascii=False, indent=2)
            prompt = SEMANTIC_RERANK_PROMPT.format(
                query=query, candidates_json=candidates_json
            )
            logger.debug(f"[rerank] Prompt length: {len(prompt)} chars")
            messages = [{"role": "user", "content": prompt}]
    
            response = await asyncio.wait_for(
                provider.chat(messages, temperature=0.3), timeout=self.RERANK_TIMEOUT
            )
            logger.debug(f"[rerank] Raw LLM response: {response[:500]}")
    
            # 使用健壮的 JSON 解析
            ranked = self._parse_json_array(response)
            if ranked and isinstance(ranked, list):
                # 验证和清洗
                valid_ids = {c["id"] for c in candidates}
                cleaned = []
                for item in ranked:
                    if isinstance(item, dict) and item.get("id") in valid_ids:
                        score = item.get("score", 50)
                        # 处理 score 可能是字符串的情况
                        try:
                            score = int(score)
                        except (ValueError, TypeError):
                            score = 50
                        cleaned.append({
                            "id": item["id"],
                            "score": min(100, max(0, score)),
                            "reason": str(item.get("reason", "")),
                        })
                # 按 score 降序
                cleaned.sort(key=lambda x: x["score"], reverse=True)
                logger.info(f"[rerank] Successfully ranked {len(cleaned)} items, top score: {cleaned[0]['score'] if cleaned else 'N/A'}")
                return cleaned
    
            # 解析失败，返回候选原始顺序
            logger.warning(f"[rerank] Failed to parse response, falling back to default scores. Response: {response[:300]}")
            return [{"id": c["id"], "score": 50, "reason": "解析失败"} for c in candidates]
    
        except asyncio.TimeoutError:
            logger.warning(f"[rerank] Timed out after {self.RERANK_TIMEOUT}s")
            return [{"id": c["id"], "score": 50, "reason": "超时"} for c in candidates]
        except Exception as e:
            logger.warning(f"[rerank] Failed: {e}")
            return [{"id": c["id"], "score": 50, "reason": str(e)} for c in candidates]

    async def get_full_cards(
        self, card_ids: list[int], db: AsyncSession
    ) -> dict[int, dict]:
        """Get full card data by IDs, return as {id: card_dict}."""
        if not card_ids:
            return {}

        stmt = select(MaterialCard).where(MaterialCard.id.in_(card_ids))
        result = await db.execute(stmt)
        cards = result.scalars().all()

        card_map = {}
        for card in cards:
            card_map[card.id] = {
                "id": card.id,
                "card_type": card.card_type,
                "title": card.title,
                "content": card.content,
                "parsed_content": card.parsed_content,
                "cover_image": card.cover_image,
                "source_url": card.source_url,
                "source_platform": card.source_platform,
                "video_url": card.video_url,
                "ai_summary": card.ai_summary,
                "ai_tags": card.ai_tags,
                "ai_suggestions": card.ai_suggestions,
                "user_tags": card.user_tags,
                "user_note": card.user_note,
                "screenshot_path": card.screenshot_path,
                "is_ai_processed": card.is_ai_processed,
                "created_at": card.created_at.isoformat() if card.created_at else None,
                "updated_at": card.updated_at.isoformat() if card.updated_at else None,
            }
        return card_map


# 全局单例
ai_search_service = AISearchService()
