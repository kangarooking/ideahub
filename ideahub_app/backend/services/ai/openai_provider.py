"""OpenAI-compatible API provider."""

import httpx

from .base import AIProvider


class OpenAIProvider(AIProvider):
    """Provider for all OpenAI-compatible APIs.
    
    Supports: ChatGPT, GLM, Kimi, MiniMax, Qwen, Gemini, etc.
    """

    async def _make_chat_request(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Make a chat completion request.
        
        Args:
            messages: List of message dicts.
            temperature: Optional temperature parameter.
            max_tokens: Optional max tokens parameter.
            
        Returns:
            The model's response text.
        """
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict = {
            "model": self.model_name,
            "messages": messages,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def chat(self, messages: list[dict], temperature: float = 0.7) -> str:
        """Send chat request to OpenAI-compatible API.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            temperature: Sampling temperature (0.0 to 1.0).
            
        Returns:
            The model's response text.
            
        Raises:
            httpx.HTTPStatusError: If the API request fails.
            
        Note:
            Some models (e.g., o1/o3 reasoning models) only allow temperature=1.
            If a temperature-related error is detected, will retry with temperature=1.
        """
        try:
            return await self._make_chat_request(messages, temperature=temperature)
        except httpx.HTTPStatusError as e:
            # Check if the error is temperature-related (e.g., o1/o3 models)
            error_text = e.response.text.lower() if e.response else ""
            if e.response.status_code == 400 and "temperature" in error_text:
                # Retry with temperature=1 for models that require it
                return await self._make_chat_request(messages, temperature=1)
            raise

    async def ocr_extract(self, image_path: str) -> str:
        """Extract text from image using OpenAI Vision API.
        
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
                        "type": "text",
                        "text": "请仔细识别这张图片中的所有文字内容，按原始布局尽可能完整地提取出来。只输出识别到的文字，不要添加解释或描述。"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
        
        try:
            # Low temperature for OCR accuracy
            return await self._make_chat_request(messages, temperature=0.1, max_tokens=4096)
        except httpx.HTTPStatusError as e:
            # Some models (e.g., o1/o3) only allow temperature=1
            error_text = e.response.text.lower() if e.response else ""
            if e.response.status_code == 400 and "temperature" in error_text:
                return await self._make_chat_request(messages, temperature=1, max_tokens=4096)
            raise
