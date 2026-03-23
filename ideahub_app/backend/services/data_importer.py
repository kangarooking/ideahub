"""Data importer service for importing crawler JSONL data into MaterialCard."""

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database.models import MaterialCard

# Platform configuration with field mappings
PLATFORM_CONFIGS: dict[str, dict[str, Any]] = {
    "xhs": {
        "name": "小红书",
        "title_field": "title",
        "content_field": "desc",
        "url_field": "note_url",
        "cover_field": lambda item: (
            item.get("image_list", "").split(",")[0]
            if item.get("image_list")
            else None
        ),
        "id_field": "note_id",
        "video_url_field": lambda item: (
            item.get("video_url", "").split(",")[0]
            if item.get("video_url")
            else None
        ),
    },
    "douyin": {
        "name": "抖音",
        "title_field": "title",
        "content_field": "desc",
        "url_field": "aweme_url",
        "cover_field": "cover_url",
        "id_field": "aweme_id",
        "video_url_field": "video_download_url",
    },
    "bilibili": {
        "name": "B站",
        "title_field": "title",
        "content_field": "desc",
        "url_field": "video_url",
        "cover_field": "video_cover_url",
        "id_field": "video_id",
        "video_url_field": None,  # B站暂无直接下载URL
    },
    "weibo": {
        "name": "微博",
        "title_field": None,
        "content_field": "content",
        "url_field": "note_url",
        "cover_field": None,
        "id_field": "note_id",
        "video_url_field": "video_url",
    },
    "zhihu": {
        "name": "知乎",
        "title_field": "title",
        "content_field": "content_text",
        "url_field": "content_url",
        "cover_field": None,
        "id_field": "content_id",
        "video_url_field": None,  # 知乎主要是文章
    },
    "kuaishou": {
        "name": "快手",
        "title_field": None,
        "content_field": "desc",
        "url_field": "video_url",
        "cover_field": "video_cover_url",
        "id_field": "video_id",
        "video_url_field": "video_play_url",
    },
    "tieba": {
        "name": "贴吧",
        "title_field": "title",
        "content_field": "desc",
        "url_field": "note_url",
        "cover_field": None,
        "id_field": "note_id",
        "video_url_field": None,  # 贴吧主要是帖子
    },
}


def extract_title(item: dict, config: dict) -> str:
    """Extract title from item, fallback to content if not available."""
    title = ""
    if config["title_field"]:
        title = item.get(config["title_field"], "")
    if not title:
        content_field = config["content_field"]
        title = item.get(content_field, "")[:100].replace("\n", " ").strip()
    return title or "无标题"


def extract_content(item: dict, config: dict) -> str:
    """Extract content from item."""
    return item.get(config["content_field"], "")


def extract_source_url(item: dict, config: dict) -> str:
    """Extract source URL from item."""
    return item.get(config["url_field"], "")


def extract_cover_image(item: dict, config: dict) -> str | None:
    """Extract cover image from item."""
    cover_field = config["cover_field"]
    if cover_field is None:
        return None
    if callable(cover_field):
        return cover_field(item)
    return item.get(cover_field) or None


def extract_video_url(item: dict, config: dict) -> str | None:
    """Extract video download URL from item."""
    video_url_field = config.get("video_url_field")
    if video_url_field is None:
        return None
    if callable(video_url_field):
        return video_url_field(item)
    return item.get(video_url_field) or None


class DataImporter:
    """Service for importing crawler JSONL data into database."""

    def __init__(self) -> None:
        self.data_dir = Path(settings.CRAWLER_DATA_DIR)

    def _is_safe_path(self, file_path: str) -> bool:
        """Check if file_path is safe (no path traversal)."""
        # Resolve absolute path and check if it's within data_dir
        try:
            full_path = (self.data_dir / file_path).resolve()
            return full_path.is_relative_to(self.data_dir.resolve())
        except (ValueError, RuntimeError):
            return False

    def _parse_filename(self, filename: str) -> dict | None:
        """
        Parse filename to extract crawler_type, item_type, and date.
        Expected format: {crawler_type}_{item_type}_{YYYY-MM-DD}.jsonl
        Example: search_contents_2025-03-22.jsonl
        """
        pattern = r"^([a-z]+)_([a-z]+)_(\d{4}-\d{2}-\d{2})\.jsonl$"
        match = re.match(pattern, filename)
        if match:
            return {
                "crawler_type": match.group(1),
                "item_type": match.group(2),
                "date": match.group(3),
            }
        return None

    def _count_lines(self, file_path: Path) -> int:
        """Count number of lines in a file."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return sum(1 for _ in f)
        except Exception:
            return 0

    def list_data_files(self) -> list[dict]:
        """
        Scan crawler_data directory for all JSONL files.
        Only returns files with item_type == "contents".
        """
        result: list[dict] = []

        for platform in PLATFORM_CONFIGS:
            jsonl_dir = self.data_dir / platform / "jsonl"
            if not jsonl_dir.exists():
                continue

            for jsonl_file in jsonl_dir.glob("*.jsonl"):
                parsed = self._parse_filename(jsonl_file.name)
                if not parsed:
                    continue

                # Only include contents type files
                if parsed["item_type"] != "contents":
                    continue

                relative_path = jsonl_file.relative_to(self.data_dir)
                file_stat = jsonl_file.stat()

                result.append(
                    {
                        "file_path": str(relative_path),
                        "platform": platform,
                        "platform_name": PLATFORM_CONFIGS[platform]["name"],
                        "crawler_type": parsed["crawler_type"],
                        "item_type": parsed["item_type"],
                        "date": parsed["date"],
                        "file_size": file_stat.st_size,
                        "line_count": self._count_lines(jsonl_file),
                    }
                )

        # Sort by date descending, then by platform
        result.sort(key=lambda x: (x["date"], x["platform"]), reverse=True)
        return result

    def preview_data(self, file_path: str, limit: int = 5) -> list[dict]:
        """
        Preview the first N items from a JSONL file.
        Returns parsed MaterialCard format preview.
        """
        if not self._is_safe_path(file_path):
            raise ValueError("Invalid file path")

        full_path = self.data_dir / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Extract platform from path
        parts = Path(file_path).parts
        if len(parts) < 1:
            raise ValueError("Invalid file path structure")
        platform = parts[0]

        if platform not in PLATFORM_CONFIGS:
            raise ValueError(f"Unknown platform: {platform}")

        config = PLATFORM_CONFIGS[platform]
        previews: list[dict] = []

        with open(full_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    preview = {
                        "title": extract_title(item, config),
                        "content": extract_content(item, config),
                        "source_url": extract_source_url(item, config),
                        "cover_image": extract_cover_image(item, config),
                        "source_platform": platform,
                        "platform_name": config["name"],
                    }
                    previews.append(preview)
                except json.JSONDecodeError:
                    continue

        return previews

    async def import_data(self, file_path: str, db: AsyncSession) -> dict:
        """
        Import data from a JSONL file into the database.
        Returns import statistics.
        """
        if not self._is_safe_path(file_path):
            raise ValueError("Invalid file path")

        full_path = self.data_dir / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Extract platform from path
        parts = Path(file_path).parts
        if len(parts) < 1:
            raise ValueError("Invalid file path structure")
        platform = parts[0]

        if platform not in PLATFORM_CONFIGS:
            raise ValueError(f"Unknown platform: {platform}")

        config = PLATFORM_CONFIGS[platform]

        # Statistics
        total = 0
        imported = 0
        skipped = 0
        errors = 0
        error_details: list[str] = []

        # Batch processing
        batch: list[MaterialCard] = []
        batch_size = 100

        with open(full_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue

                total += 1

                try:
                    item = json.loads(line)

                    # Extract fields
                    source_url = extract_source_url(item, config)

                    # Skip if no source_url (can't dedupe)
                    if not source_url:
                        errors += 1
                        error_details.append(f"Line {line_num}: Missing source URL")
                        continue

                    # Check for duplicates
                    existing = await db.execute(
                        select(MaterialCard.id).where(
                            MaterialCard.source_url == source_url
                        )
                    )
                    if existing.scalar_one_or_none() is not None:
                        skipped += 1
                        continue

                    # Create new card
                    title = extract_title(item, config)
                    content = extract_content(item, config)
                    cover_image = extract_cover_image(item, config)
                    video_url = extract_video_url(item, config)

                    # Extract source_keyword from item if available
                    source_keyword = item.get("source_keyword", "")

                    card = MaterialCard(
                        card_type="platform",
                        title=title,
                        content=content,
                        cover_image=cover_image,
                        source_url=source_url,
                        source_platform=platform,
                        video_url=video_url,
                        user_note=source_keyword if source_keyword else None,
                        is_ai_processed=False,
                    )
                    batch.append(card)
                    imported += 1

                    # Commit batch
                    if len(batch) >= batch_size:
                        db.add_all(batch)
                        await db.commit()
                        batch = []

                except json.JSONDecodeError as e:
                    errors += 1
                    error_details.append(f"Line {line_num}: JSON parse error - {e}")
                except Exception as e:
                    errors += 1
                    error_details.append(f"Line {line_num}: {str(e)}")

        # Commit remaining batch
        if batch:
            db.add_all(batch)
            await db.commit()

        return {
            "total": total,
            "imported": imported,
            "skipped": skipped,
            "errors": errors,
            "error_details": error_details[:50],  # Limit error details
        }


# Global singleton instance
data_importer = DataImporter()
