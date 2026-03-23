"""Anthropic Claude API provider."""

import httpx

from .base import AIProvider


class AnthropicProvider(AIProvider):
    """Provider for Anthropic Messages API (Claude)."""

    def _build_anthropic_payload(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int = 2048,
    ) -> dict:
        """Build Anthropic API payload from messages.
        
        Args:
            messages: List of message dicts.
            temperature: Optional temperature parameter.
            max_tokens: Max tokens for response.
            
        Returns:
            The payload dict for Anthropic API.
        """
        # Convert OpenAI format messages to Anthropic format
        # Extract system message, rest as messages
        system_msg = ""
        anthropic_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                anthropic_messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })

        payload: dict = {
            "model": self.model_name,
            "max_tokens": max_tokens,
            "messages": anthropic_messages,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if system_msg:
            payload["system"] = system_msg
            
        return payload

    async def _make_request(self, payload: dict) -> str:
        """Make request to Anthropic API."""
        url = f"{self.base_url.rstrip('/')}/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]

    async def chat(self, messages: list[dict], temperature: float = 0.7) -> str:
        """Send chat request to Anthropic API.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            temperature: Sampling temperature (0.0 to 1.0).
            
        Returns:
            The model's response text.
            
        Raises:
            httpx.HTTPStatusError: If the API request fails.
            
        Note:
            If a temperature-related error is detected, will retry with temperature=1.
        """
        payload = self._build_anthropic_payload(messages, temperature=temperature)
        try:
            return await self._make_request(payload)
        except httpx.HTTPStatusError as e:
            # Check if the error is temperature-related
            error_text = e.response.text.lower() if e.response else ""
            if e.response.status_code == 400 and "temperature" in error_text:
                payload["temperature"] = 1
                return await self._make_request(payload)
            raise

    async def ocr_extract(self, image_path: str) -> str:
        """Extract text from image using Anthropic Vision API.
        
        Args:
            image_path: Path to the image file.
            
        Returns:
            Extracted text from the image.
            
        Raises:
            httpx.HTTPStatusError: If the API request fails.
        """
        base64_image, media_type = self._encode_image(image_path)
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64_image,
                        }
                    },
                    {
                        "type": "text",
                        "text": "请仔细识别这张图片中的所有文字内容，按原始布局尽可能完整地提取出来。只输出识别到的文字，不要添加解释或描述。"
                    }
                ]
            }
        ]
        
        payload = {
            "model": self.model_name,
            "max_tokens": 4096,
            "temperature": 0.1,  # Low temperature for OCR accuracy
            "messages": messages,
        }

        try:
            return await self._make_request(payload)
        except httpx.HTTPStatusError as e:
            # Handle temperature-related errors
            error_text = e.response.text.lower() if e.response else ""
            if e.response.status_code == 400 and "temperature" in error_text:
                payload["temperature"] = 1
                return await self._make_request(payload)
            raise
