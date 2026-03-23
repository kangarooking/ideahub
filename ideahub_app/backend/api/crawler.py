"""Crawler service management and task proxy routes."""

import asyncio
from enum import Enum
from typing import Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database.session import get_db
from ..services.crawler_manager import crawler_manager
from ..services.data_importer import data_importer

router = APIRouter(prefix="/crawler", tags=["crawler"])

# ============================================================================
# Pydantic Models for Crawler Task API
# ============================================================================


class PlatformEnum(str, Enum):
    """Supported media platforms (matches MediaCrawler)."""
    XHS = "xhs"
    DOUYIN = "dy"
    KUAISHOU = "ks"
    BILIBILI = "bili"
    WEIBO = "wb"
    TIEBA = "tieba"
    ZHIHU = "zhihu"


class LoginTypeEnum(str, Enum):
    """Login method."""
    QRCODE = "qrcode"
    PHONE = "phone"
    COOKIE = "cookie"


class CrawlerTypeEnum(str, Enum):
    """Crawler type."""
    SEARCH = "search"
    DETAIL = "detail"
    CREATOR = "creator"


class SaveDataOptionEnum(str, Enum):
    """Data save option."""
    CSV = "csv"
    DB = "db"
    JSON = "json"
    JSONL = "jsonl"
    SQLITE = "sqlite"
    MONGODB = "mongodb"
    EXCEL = "excel"


class CrawlerStartRequest(BaseModel):
    """Crawler start request (matches MediaCrawler schema)."""
    platform: PlatformEnum
    login_type: LoginTypeEnum = LoginTypeEnum.QRCODE
    crawler_type: CrawlerTypeEnum = CrawlerTypeEnum.SEARCH
    keywords: str = ""  # Keywords for search mode
    specified_ids: str = ""  # Post/video ID list for detail mode
    creator_ids: str = ""  # Creator ID list for creator mode
    start_page: int = 1
    enable_comments: bool = True
    enable_sub_comments: bool = False
    save_option: SaveDataOptionEnum = SaveDataOptionEnum.JSONL
    cookies: str = ""
    headless: bool = False


class PlatformInfo(BaseModel):
    """Platform information."""
    id: str
    name: str
    icon: str
    modes: list[str]


# Supported platforms list
PLATFORMS: list[dict] = [
    {"id": "xhs", "name": "小红书", "icon": "📕", "modes": ["search", "detail", "creator"]},
    {"id": "dy", "name": "抖音", "icon": "🎵", "modes": ["search", "detail", "creator"]},
    {"id": "bili", "name": "B站", "icon": "📺", "modes": ["search", "detail", "creator"]},
    {"id": "wb", "name": "微博", "icon": "📰", "modes": ["search", "detail", "creator"]},
    {"id": "zhihu", "name": "知乎", "icon": "💡", "modes": ["search", "detail", "creator"]},
    {"id": "ks", "name": "快手", "icon": "⚡", "modes": ["search", "detail", "creator"]},
    {"id": "tieba", "name": "贴吧", "icon": "💬", "modes": ["search", "detail", "creator"]},
]


# ============================================================================
# Helper Functions
# ============================================================================


async def proxy_request(
    method: str,
    path: str,
    body: Optional[dict] = None,
    params: Optional[dict] = None,
) -> dict:
    """Proxy request to MediaCrawler API using aiohttp."""
    url = f"{settings.MEDIA_CRAWLER_API_URL}{path}"
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            if method == "GET":
                async with session.get(url, params=params) as resp:
                    if resp.status >= 400:
                        text = await resp.text()
                        raise HTTPException(status_code=resp.status, detail=text or f"HTTP {resp.status}")
                    return await resp.json()
            elif method == "POST":
                async with session.post(url, json=body) as resp:
                    if resp.status >= 400:
                        text = await resp.text()
                        raise HTTPException(status_code=resp.status, detail=text or f"HTTP {resp.status}")
                    return await resp.json()
            else:
                raise ValueError(f"Unsupported method: {method}")
    except aiohttp.ClientConnectorError:
        raise HTTPException(
            status_code=503,
            detail="MediaCrawler service is not running. Please start the service first.",
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Request to MediaCrawler timed out.",
        )


@router.post("/service/start")
async def start_crawler_service() -> dict:
    """Start MediaCrawler API service (with automatic environment initialization)."""
    result = await crawler_manager.start_service()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/service/stop")
async def stop_crawler_service() -> dict:
    """Stop MediaCrawler API service."""
    result = await crawler_manager.stop_service()
    return result


@router.get("/service/status")
async def get_service_status() -> dict:
    """Get service status."""
    status = crawler_manager.get_service_status()
    status["healthy"] = await crawler_manager.health_check() if status["running"] else False
    return status


@router.post("/service/init")
async def init_environment() -> dict:
    """Manually trigger environment initialization."""
    result = await crawler_manager.init_environment()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.get("/service/env-status")
async def get_env_status() -> dict:
    """Query environment initialization status."""
    return crawler_manager.get_env_status()


# ============ Data Import Routes ============


class ImportRequest(BaseModel):
    """Request schema for data import."""

    file_path: str


class PreviewRequest(BaseModel):
    """Request schema for data preview."""

    file_path: str
    limit: int = 5


@router.get("/data-files")
async def list_data_files() -> dict:
    """List all importable JSONL data files from crawler_data directory."""
    try:
        files = data_importer.list_data_files()
        return {"success": True, "files": files, "total": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-preview")
async def preview_import_data(request: PreviewRequest) -> dict:
    """Preview data from a JSONL file before importing."""
    try:
        previews = data_importer.preview_data(request.file_path, request.limit)
        return {"success": True, "previews": previews, "count": len(previews)}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_data(
    request: ImportRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    """Import data from a JSONL file into the database."""
    try:
        result = await data_importer.import_data(request.file_path, db)
        return {"success": True, **result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Crawler Task Proxy Routes (forward to MediaCrawler API)
# ============================================================================


@router.post("/start")
async def start_crawler(request: CrawlerStartRequest) -> dict:
    """
    Start crawler task.
    
    Proxies to MediaCrawler POST /api/crawler/start
    """
    return await proxy_request("POST", "/api/crawler/start", body=request.model_dump())


@router.post("/stop")
async def stop_crawler() -> dict:
    """
    Stop crawler task.
    
    Proxies to MediaCrawler POST /api/crawler/stop
    """
    return await proxy_request("POST", "/api/crawler/stop")


@router.get("/status")
async def get_crawler_status() -> dict:
    """
    Get crawler task status.
    
    Proxies to MediaCrawler GET /api/crawler/status
    """
    return await proxy_request("GET", "/api/crawler/status")


@router.get("/logs")
async def get_crawler_logs(limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    """
    Get crawler logs.
    
    Proxies to MediaCrawler GET /api/crawler/logs
    """
    return await proxy_request("GET", "/api/crawler/logs", params={"limit": limit})


# ============================================================================
# Platform List API (local, no proxy needed)
# ============================================================================


@router.get("/platforms")
async def get_platforms() -> list[dict]:
    """
    Get list of supported crawler platforms.
    
    Returns platform info including id, name, icon, and supported modes.
    """
    return PLATFORMS
