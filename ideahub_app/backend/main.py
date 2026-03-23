"""IdeaHub API - FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.ai import router as ai_router
from .api.cards import router as cards_router
from .api.crawler import router as crawler_router
from .api.upload import router as upload_router
from .config import settings
from .database.session import async_session_maker, init_db
from .services.ai import ProviderRegistry
from .services.crawler_manager import crawler_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events handler."""
    # Startup: Initialize database
    await init_db()
    
    # Initialize AI model presets
    async with async_session_maker() as session:
        await ProviderRegistry.init_presets(session)
    
    yield
    # Shutdown: cleanup
    # Stop MediaCrawler service if running
    await crawler_manager.stop_service()


# Create FastAPI app instance
app = FastAPI(
    title="IdeaHub API",
    description="API for managing material cards and content inspiration",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(cards_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(crawler_router, prefix="/api")

# Mount static files for uploads
upload_path = Path(settings.UPLOAD_DIR)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


# ============================================================================
# WebSocket Proxy for Crawler Logs
# ============================================================================


@app.websocket("/api/ws/crawler-logs")
async def websocket_crawler_logs_proxy(websocket: WebSocket):
    """
    WebSocket proxy for MediaCrawler log stream.
    
    Connects to MediaCrawler's /api/ws/logs and forwards messages bidirectionally.
    """
    await websocket.accept()
    logger.info("[WS Proxy] Client connected")
    
    # Build MediaCrawler WebSocket URL
    mc_ws_url = settings.MEDIA_CRAWLER_API_URL.replace("http://", "ws://").replace("https://", "wss://")
    mc_ws_url = f"{mc_ws_url}/api/ws/logs"
    
    upstream_ws = None
    
    async def forward_upstream_to_client(upstream, client):
        """Forward messages from MediaCrawler to frontend client."""
        try:
            async for message in upstream.iter_text():
                try:
                    await client.send_text(message)
                except Exception:
                    break
        except Exception as e:
            logger.debug(f"[WS Proxy] Upstream read error: {e}")
    
    async def forward_client_to_upstream(client, upstream):
        """Forward messages from frontend client to MediaCrawler."""
        try:
            while True:
                data = await client.receive_text()
                await upstream.send_text(data)
        except WebSocketDisconnect:
            logger.info("[WS Proxy] Client disconnected")
        except Exception as e:
            logger.debug(f"[WS Proxy] Client read error: {e}")
    
    try:
        # Connect to MediaCrawler WebSocket using httpx
        async with httpx.AsyncClient() as http_client:
            async with http_client.stream(
                "GET",
                mc_ws_url,
                headers={
                    "Upgrade": "websocket",
                    "Connection": "Upgrade",
                    "Sec-WebSocket-Version": "13",
                    "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
                },
                timeout=None,
            ) as response:
                # For proper WebSocket, we need websockets library
                # Fallback: use simpler approach with websockets
                pass
    except Exception as e:
        logger.warning(f"[WS Proxy] Cannot use httpx for WebSocket: {e}")
    
    # Use websockets library for proper WebSocket proxy
    try:
        import websockets
        
        async with websockets.connect(mc_ws_url) as upstream_ws:
            logger.info(f"[WS Proxy] Connected to MediaCrawler at {mc_ws_url}")
            
            # Create tasks for bidirectional forwarding
            async def recv_upstream():
                try:
                    async for message in upstream_ws:
                        await websocket.send_text(message)
                except websockets.ConnectionClosed:
                    pass
                except Exception as e:
                    logger.debug(f"[WS Proxy] Upstream error: {e}")
            
            async def recv_client():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream_ws.send(data)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.debug(f"[WS Proxy] Client error: {e}")
            
            # Run both tasks concurrently
            upstream_task = asyncio.create_task(recv_upstream())
            client_task = asyncio.create_task(recv_client())
            
            try:
                done, pending = await asyncio.wait(
                    [upstream_task, client_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
            finally:
                # Cancel pending tasks
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
    
    except ImportError:
        # websockets library not available, use polling fallback
        logger.warning("[WS Proxy] websockets library not installed, using HTTP polling fallback")
        await websocket.send_json({
            "level": "warning",
            "message": "WebSocket proxy unavailable. Please install 'websockets' library."
        })
        await websocket.close()
    
    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg or "Connect call failed" in error_msg:
            logger.warning("[WS Proxy] MediaCrawler service not running")
            await websocket.send_json({
                "level": "error",
                "message": "MediaCrawler service is not running. Please start the service first."
            })
        else:
            logger.error(f"[WS Proxy] Error: {e}")
            await websocket.send_json({
                "level": "error",
                "message": f"WebSocket proxy error: {error_msg}"
            })
        
        try:
            await websocket.close()
        except Exception:
            pass
    
    finally:
        logger.info("[WS Proxy] Connection closed")


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint - health check."""
    return {"message": "Welcome to IdeaHub API", "status": "running"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}
