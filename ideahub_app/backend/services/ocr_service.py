"""OCR service for extracting text from images.

Supports two modes:
1. llm_vision: Uses LLM's multimodal vision capabilities (recommended, requires AI model config)
2. paddleocr: Uses PaddleOCR local engine
"""

import asyncio
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class OCRService:
    """
    Singleton OCR service for extracting text from images.

    Supports two modes:
    1. llm_vision: Uses LLM's multimodal vision capabilities (recommended)
    2. paddleocr: Uses PaddleOCR local engine (fallback)
    
    LLM vision mode is preferred and will fall back to PaddleOCR on failure.
    """

    _instance: "OCRService | None" = None
    _ocr_engine: Any = None
    _engine_type: str = "none"

    @classmethod
    def get_instance(cls) -> "OCRService":
        """Get or create the singleton OCR service instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        """Initialize the OCR engine (lazy loading on first use)."""
        if OCRService._ocr_engine is not None:
            return

        # Try to initialize PaddleOCR
        try:
            from paddleocr import PaddleOCR

            # Initialize with Chinese + English support, angle classification enabled
            OCRService._ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang="ch",
                show_log=False,  # Reduce console noise
            )
            OCRService._engine_type = "paddleocr"
            logger.info("OCR engine initialized: PaddleOCR")
        except ImportError:
            logger.warning("PaddleOCR not available, OCR will be disabled")
            OCRService._engine_type = "none"
        except Exception as e:
            logger.warning(f"Failed to initialize PaddleOCR: {e}")
            OCRService._engine_type = "none"

    @property
    def is_available(self) -> bool:
        """Check if OCR engine is available."""
        return self._engine_type != "none"

    @property
    def engine_type(self) -> str:
        """Get the current OCR engine type."""
        return self._engine_type

    def _extract_text_sync(self, image_path: str) -> str:
        """
        Synchronous text extraction from image using PaddleOCR.

        Args:
            image_path: Path to the image file.

        Returns:
            Extracted text as a single string.
        """
        if not self.is_available:
            raise RuntimeError("PaddleOCR engine is not available")

        # Validate image path
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        if self._engine_type == "paddleocr":
            return self._extract_with_paddleocr(image_path)
        else:
            raise RuntimeError(f"Unknown OCR engine: {self._engine_type}")

    def _extract_with_paddleocr(self, image_path: str) -> str:
        """Extract text using PaddleOCR."""
        result = self._ocr_engine.ocr(image_path, cls=True)

        if not result or not result[0]:
            return ""

        # Extract text from OCR result
        # PaddleOCR result format: [[[box], (text, confidence)], ...]
        lines: list[str] = []
        for line in result[0]:
            if line and len(line) >= 2:
                text_info = line[1]
                if isinstance(text_info, tuple) and len(text_info) >= 1:
                    text = text_info[0]
                    if text:
                        lines.append(str(text))

        return "\n".join(lines)

    async def _extract_with_llm(self, image_path: str, db_session) -> str:
        """Extract text using LLM vision capabilities.
        
        Args:
            image_path: Path to the image file.
            db_session: Database session for getting active AI provider.
            
        Returns:
            Extracted text from the image.
        """
        from .ai.provider_registry import ProviderRegistry
        provider = await ProviderRegistry.get_active_provider(db_session)
        return await provider.ocr_extract(image_path)

    async def _extract_with_paddleocr_async(self, image_path: str) -> str:
        """Extract text using PaddleOCR asynchronously.
        
        Args:
            image_path: Path to the image file.
            
        Returns:
            Extracted text from the image.
        """
        return await asyncio.to_thread(self._extract_text_sync, image_path)

    async def extract_text(
        self,
        image_path: str,
        mode: str = "llm_vision",
        db_session=None,
    ) -> str:
        """
        Extract text from an image asynchronously.

        Args:
            image_path: Path to the image file.
            mode: OCR mode - "llm_vision" or "paddleocr".
            db_session: Database session (required for llm_vision mode).

        Returns:
            Extracted text as a single string.

        Raises:
            RuntimeError: If OCR fails.
            FileNotFoundError: If image file does not exist.
            ValueError: If unknown mode is specified.
        """
        # Validate image path
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        if mode == "llm_vision":
            try:
                return await self._extract_with_llm(image_path, db_session)
            except Exception as e:
                # Fall back to PaddleOCR if LLM mode fails
                logger.warning(f"LLM Vision OCR failed: {e}, falling back to PaddleOCR")
                if self.is_available:
                    return await self._extract_with_paddleocr_async(image_path)
                raise RuntimeError(
                    f"LLM Vision OCR failed and PaddleOCR is not available: {e}"
                )
        elif mode == "paddleocr":
            return await self._extract_with_paddleocr_async(image_path)
        else:
            raise ValueError(f"Unknown OCR mode: {mode}. Use 'llm_vision' or 'paddleocr'.")

    async def extract_text_safe(
        self,
        image_path: str,
        mode: str = "llm_vision",
        db_session=None,
    ) -> dict[str, Any]:
        """
        Extract text from an image with error handling.

        Args:
            image_path: Path to the image file.
            mode: OCR mode - "llm_vision" or "paddleocr".
            db_session: Database session (required for llm_vision mode).

        Returns:
            dict containing:
                - text: Extracted text (empty string on error)
                - success: Boolean indicating if extraction succeeded
                - error: Error message if extraction failed
                - mode_used: The OCR mode that was actually used
        """
        result: dict[str, Any] = {
            "text": "",
            "success": False,
            "error": None,
            "mode_used": mode,
        }

        # For llm_vision mode, check if db_session is provided
        if mode == "llm_vision" and db_session is None:
            logger.warning("LLM Vision mode requires db_session, falling back to PaddleOCR")
            mode = "paddleocr"
            result["mode_used"] = "paddleocr"

        # For paddleocr mode, check if engine is available
        if mode == "paddleocr" and not self.is_available:
            result["error"] = "PaddleOCR 服务不可用，请检查 PaddleOCR 是否正确安装"
            return result

        try:
            result["text"] = await self.extract_text(image_path, mode, db_session)
            result["success"] = True
        except FileNotFoundError as e:
            result["error"] = f"图片文件不存在: {str(e)}"
        except ValueError as e:
            result["error"] = f"无效的 OCR 模式: {str(e)}"
        except Exception as e:
            result["error"] = f"OCR 识别失败: {str(e)}"
            logger.exception("OCR extraction failed")

        return result
