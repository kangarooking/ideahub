"""Base class for AI providers."""

import base64
import json
import mimetypes
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Abstract base class for AI providers."""

    def __init__(self, base_url: str, api_key: str, model_name: str) -> None:
        self.base_url = base_url
        self.api_key = api_key
        self.model_name = model_name

    @abstractmethod
    async def chat(self, messages: list[dict], temperature: float = 0.7) -> str:
        """Send chat request and return model response text.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            temperature: Sampling temperature (0.0 to 1.0).
            
        Returns:
            The model's response text.
        """
        pass

    async def summarize(self, content: str) -> str:
        """Generate a summary of the content.
        
        Args:
            content: The content to summarize.
            
        Returns:
            A concise summary of the content.
        """
        from .prompts import SUMMARIZE_PROMPT

        messages = [
            {"role": "system", "content": SUMMARIZE_PROMPT},
            {"role": "user", "content": content[:4000]},  # Truncate to avoid exceeding token limit
        ]
        return await self.chat(messages, temperature=0.3)

    async def extract_tags(self, content: str) -> list[str]:
        """Extract tags from the content.
        
        Args:
            content: The content to extract tags from.
            
        Returns:
            A list of extracted tags.
        """
        from .prompts import EXTRACT_TAGS_PROMPT

        messages = [
            {"role": "system", "content": EXTRACT_TAGS_PROMPT},
            {"role": "user", "content": content[:4000]},
        ]
        result = await self.chat(messages, temperature=0.3)

        # Parse the returned tags (JSON array or comma-separated)
        try:
            tags = json.loads(result)
            if isinstance(tags, list):
                return [str(t).strip() for t in tags if t]
        except json.JSONDecodeError:
            # Try comma-separated format
            return [t.strip() for t in result.split(",") if t.strip()]
        return []

    async def suggest_ideas(self, content: str) -> str:
        """Generate creative direction suggestions.
        
        Args:
            content: The content to base suggestions on.
            
        Returns:
            Creative direction suggestions.
        """
        from .prompts import SUGGEST_IDEAS_PROMPT

        messages = [
            {"role": "system", "content": SUGGEST_IDEAS_PROMPT},
            {"role": "user", "content": content[:4000]},
        ]
        return await self.chat(messages, temperature=0.8)

    @staticmethod
    def _encode_image(image_path: str) -> tuple[str, str]:
        """Read image file and encode to base64.
        
        Args:
            image_path: Path to the image file.
            
        Returns:
            Tuple of (base64_string, media_type).
        """
        media_type = mimetypes.guess_type(image_path)[0] or "image/png"
        with open(image_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8"), media_type

    async def ocr_extract(self, image_path: str) -> str:
        """Extract text from image using LLM vision capabilities.
        
        This method should be overridden by subclasses to implement
        provider-specific vision API calls.
        
        Args:
            image_path: Path to the image file.
            
        Returns:
            Extracted text from the image.
            
        Raises:
            NotImplementedError: If the provider doesn't support vision.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support vision/OCR capabilities"
        )
