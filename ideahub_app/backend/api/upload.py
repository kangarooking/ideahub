"""Upload API routes for link parsing and screenshot OCR."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database.session import get_db
from ..schemas.card import CardCreate, CardResponse, LinkParseRequest, LinkParseResponse
from ..services.card_service import CardService
from ..services.link_parser import LinkParser
from ..services.ocr_service import OCRService

router = APIRouter(prefix="/cards", tags=["upload"])

# Allowed image extensions for screenshot upload
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

# Valid OCR modes
VALID_OCR_MODES = {"llm_vision", "paddleocr"}


def _is_allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def _generate_filename(original_filename: str) -> str:
    """Generate a unique filename while preserving extension."""
    ext = Path(original_filename).suffix.lower()
    return f"{uuid.uuid4().hex}{ext}"


@router.post("/from-link", response_model=CardResponse, status_code=201)
async def create_card_from_link(
    request: LinkParseRequest,
    db: AsyncSession = Depends(get_db),
) -> CardResponse:
    """
    Create a card from a web link.

    Parses the URL to extract title, description, cover image, and content,
    then creates a card with card_type="link".
    """
    # Parse the URL
    parsed = await LinkParser.parse(request.url)

    if not parsed["success"]:
        raise HTTPException(
            status_code=400,
            detail=f"链接解析失败: {parsed['error']}",
        )

    # Create the card
    card_data = CardCreate(
        card_type="link",
        title=parsed["title"],
        content=parsed["content"] or parsed["description"] or "",
        source_url=parsed["source_url"],
    )

    card = await CardService.create_card(db, card_data)

    # Update additional fields that are not in CardCreate
    if parsed["cover_image"]:
        card.cover_image = parsed["cover_image"]
    if parsed["content"]:
        card.parsed_content = parsed["content"]

    await db.flush()
    await db.refresh(card)

    return CardResponse.model_validate(card)


@router.post("/parse-link", response_model=LinkParseResponse)
async def parse_link(request: LinkParseRequest) -> LinkParseResponse:
    """
    Parse a web link without creating a card.

    Useful for previewing link content before saving.
    """
    parsed = await LinkParser.parse(request.url)
    return LinkParseResponse(
        title=parsed["title"],
        description=parsed["description"],
        cover_image=parsed["cover_image"],
        content=parsed["content"],
        source_url=parsed["source_url"],
        success=parsed["success"],
        error=parsed["error"],
    )


@router.post("/from-screenshot", response_model=CardResponse, status_code=201)
async def create_card_from_screenshot(
    file: UploadFile = File(..., description="Screenshot image file"),
    ocr_mode: str = Form(default=settings.OCR_MODE, description="OCR mode: llm_vision or paddleocr"),
    db: AsyncSession = Depends(get_db),
) -> CardResponse:
    """
    Create a card from a screenshot image.

    Uploads the image, extracts text via OCR, and creates a card
    with card_type="screenshot".
    
    OCR modes:
    - llm_vision: Use LLM's vision capabilities (recommended, requires AI model config)
    - paddleocr: Use PaddleOCR local engine
    """
    # Validate OCR mode
    if ocr_mode not in VALID_OCR_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 OCR 模式: {ocr_mode}。支持的模式: {', '.join(VALID_OCR_MODES)}",
        )
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    if not _is_allowed_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式。支持的格式: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Generate unique filename and save
    new_filename = _generate_filename(file.filename)
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / new_filename

    try:
        # Save uploaded file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Get OCR service instance
        ocr_service = OCRService.get_instance()

        # Extract text from image using specified mode
        ocr_result = await ocr_service.extract_text_safe(
            str(file_path),
            mode=ocr_mode,
            db_session=db,
        )

        if not ocr_result["success"]:
            # OCR failed but we still save the card with empty content
            extracted_text = ""
        else:
            extracted_text = ocr_result["text"]

        # Create the card
        card_data = CardCreate(
            card_type="screenshot",
            title=f"截图_{new_filename[:8]}",  # Use part of filename as default title
            content=extracted_text or "(无法识别文字)",
        )

        card = await CardService.create_card(db, card_data)

        # Set screenshot path (relative path for serving via static files)
        card.screenshot_path = f"/uploads/{new_filename}"

        await db.flush()
        await db.refresh(card)

        return CardResponse.model_validate(card)

    except Exception as e:
        # Clean up uploaded file on error
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=500,
            detail=f"处理截图失败: {str(e)}",
        )


@router.get("/ocr-status")
async def get_ocr_status(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Get OCR service status.

    Returns information about OCR availability, supported modes, and current settings.
    """
    ocr_service = OCRService.get_instance()
    
    # Check if LLM provider is available
    llm_available = False
    llm_provider_name = None
    try:
        from ..services.ai.provider_registry import ProviderRegistry
        config = await ProviderRegistry.get_active_config(db)
        if config and config.api_key:
            llm_available = True
            llm_provider_name = config.name
    except Exception:
        pass
    
    return {
        "paddleocr_available": ocr_service.is_available,
        "paddleocr_engine": ocr_service.engine_type,
        "llm_vision_available": llm_available,
        "llm_provider_name": llm_provider_name,
        "default_mode": settings.OCR_MODE,
        "supported_modes": list(VALID_OCR_MODES),
    }
