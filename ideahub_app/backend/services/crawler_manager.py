"""MediaCrawler environment initialization and service management."""

import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class MediaCrawlerManager:
    """MediaCrawler environment initialization and service management."""

    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None
        self.crawler_dir = Path(settings.MEDIA_CRAWLER_DIR).resolve()
        self.data_dir = Path(settings.CRAWLER_DATA_DIR).resolve()
        self.api_url = settings.MEDIA_CRAWLER_API_URL
        self.api_port = settings.MEDIA_CRAWLER_API_PORT
        self._env_initialized = False
        self._init_status_file = self.crawler_dir / ".ideahub_init_done"

    # --- Environment Initialization ---

    def check_crawler_dir(self) -> bool:
        """Check if MediaCrawler directory exists."""
        return self.crawler_dir.exists() and (self.crawler_dir / "pyproject.toml").exists()

    def is_env_initialized(self) -> bool:
        """Check if environment has been initialized."""
        return self._init_status_file.exists()

    async def init_environment(self) -> dict:
        """
        Initialize MediaCrawler environment:
        1. Check directory
        2. uv sync to install dependencies
        3. playwright install chromium
        4. Create crawler_data directory
        Returns {"success": bool, "message": str, "steps": [...]}
        """
        steps = []

        # 1. Check directory
        if not self.check_crawler_dir():
            return {
                "success": False,
                "message": "MediaCrawler directory not found",
                "steps": steps,
            }
        steps.append({"step": "check_dir", "status": "ok"})

        # 2. uv sync
        try:
            # Create clean environment without VIRTUAL_ENV to avoid conflicts
            clean_env = os.environ.copy()
            clean_env.pop("VIRTUAL_ENV", None)
            
            result = await asyncio.to_thread(
                subprocess.run,
                ["uv", "sync"],
                cwd=str(self.crawler_dir),
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
                env=clean_env,
            )
            if result.returncode != 0:
                steps.append({"step": "uv_sync", "status": "error", "detail": result.stderr[:500]})
                return {
                    "success": False,
                    "message": f"uv sync failed: {result.stderr[:200]}",
                    "steps": steps,
                }
            steps.append({"step": "uv_sync", "status": "ok"})
        except subprocess.TimeoutExpired:
            steps.append({"step": "uv_sync", "status": "error", "detail": "timeout"})
            return {"success": False, "message": "uv sync timeout (5min)", "steps": steps}
        except Exception as e:
            steps.append({"step": "uv_sync", "status": "error", "detail": str(e)})
            return {"success": False, "message": f"uv sync error: {e}", "steps": steps}

        # 3. playwright install chromium
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["uv", "run", "playwright", "install", "chromium"],
                cwd=str(self.crawler_dir),
                capture_output=True,
                text=True,
                timeout=600,  # 10 minutes timeout
                env=clean_env,
            )
            if result.returncode != 0:
                steps.append({"step": "playwright_install", "status": "error", "detail": result.stderr[:500]})
                return {
                    "success": False,
                    "message": f"playwright install failed: {result.stderr[:200]}",
                    "steps": steps,
                }
            steps.append({"step": "playwright_install", "status": "ok"})
        except subprocess.TimeoutExpired:
            steps.append({"step": "playwright_install", "status": "error", "detail": "timeout"})
            return {"success": False, "message": "playwright install timeout (10min)", "steps": steps}
        except Exception as e:
            steps.append({"step": "playwright_install", "status": "error", "detail": str(e)})
            return {"success": False, "message": f"playwright install error: {e}", "steps": steps}

        # 4. Create crawler_data directory structure
        platform_dirs = ["xhs", "douyin", "zhihu", "bilibili", "weibo", "kuaishou", "tieba"]
        for platform_dir in platform_dirs:
            (self.data_dir / platform_dir).mkdir(parents=True, exist_ok=True)
        steps.append({"step": "create_data_dirs", "status": "ok"})

        # 5. Mark initialization complete
        self._init_status_file.write_text(json.dumps({"initialized": True, "steps": steps}))
        self._env_initialized = True

        return {"success": True, "message": "Environment initialized successfully", "steps": steps}

    def get_env_status(self) -> dict:
        """Get environment status."""
        return {
            "crawler_dir_exists": self.check_crawler_dir(),
            "initialized": self.is_env_initialized(),
            "data_dir": str(self.data_dir),
            "crawler_dir": str(self.crawler_dir),
        }

    # --- Service Management ---

    async def start_service(self) -> dict:
        """Start MediaCrawler API service."""
        # If already running, return
        if self.process and self.process.poll() is None:
            return {"success": True, "message": "Service already running"}

        # Check if environment is initialized
        if not self.is_env_initialized():
            init_result = await self.init_environment()
            if not init_result["success"]:
                return {"success": False, "message": f"Environment init failed: {init_result['message']}"}

        # Start MediaCrawler API service
        try:
            # Create clean environment without VIRTUAL_ENV to avoid conflicts
            env = os.environ.copy()
            env.pop("VIRTUAL_ENV", None)
            # Set data output directory to IdeaHub's crawler_data directory
            env["SAVE_DATA_DIR"] = str(self.data_dir)

            self.process = subprocess.Popen(
                ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", str(self.api_port)],
                cwd=str(self.crawler_dir),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for service to start (up to 15 seconds)
            for _ in range(30):
                await asyncio.sleep(0.5)
                if await self.health_check():
                    return {"success": True, "message": "Service started successfully", "pid": self.process.pid}
                # Check if process has exited
                if self.process.poll() is not None:
                    stderr = self.process.stderr.read().decode() if self.process.stderr else ""
                    return {"success": False, "message": f"Service exited unexpectedly: {stderr[:300]}"}

            return {"success": False, "message": "Service start timeout (15s)"}
        except Exception as e:
            logger.exception("Failed to start MediaCrawler service")
            return {"success": False, "message": f"Failed to start service: {e}"}

    async def stop_service(self) -> dict:
        """Stop MediaCrawler API service."""
        if not self.process or self.process.poll() is not None:
            self.process = None
            return {"success": True, "message": "Service not running"}

        try:
            # First try graceful termination
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                # If still not exited, force kill
                self.process.kill()
                self.process.wait(timeout=5)
            self.process = None
            return {"success": True, "message": "Service stopped"}
        except Exception as e:
            logger.exception("Failed to stop MediaCrawler service")
            return {"success": False, "message": f"Failed to stop service: {e}"}

    async def health_check(self) -> bool:
        """Check if MediaCrawler API service is healthy."""
        try:
            # trust_env=False to avoid proxy interference for local requests
            async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
                resp = await client.get(f"{self.api_url}/api/health")
                return resp.status_code == 200
        except Exception:
            return False

    def get_service_status(self) -> dict:
        """Get service status."""
        running = self.process is not None and self.process.poll() is None
        return {
            "running": running,
            "pid": self.process.pid if running else None,
            "api_url": self.api_url,
        }


# Global singleton
crawler_manager = MediaCrawlerManager()
