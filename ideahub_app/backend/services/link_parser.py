"""Web link parsing service for extracting content from URLs."""

from typing import Any

import httpx
from bs4 import BeautifulSoup
from readability import Document


class LinkParser:
    """Service for parsing web links and extracting structured content."""

    # Common browser User-Agent to avoid being blocked
    USER_AGENT = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    # Request timeout in seconds
    TIMEOUT = 10.0

    @staticmethod
    def _extract_og_meta(soup: BeautifulSoup) -> dict[str, str | None]:
        """Extract Open Graph meta tags from HTML."""
        og_data: dict[str, str | None] = {
            "title": None,
            "description": None,
            "image": None,
        }

        # Extract og:title
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            og_data["title"] = str(og_title["content"]).strip()

        # Extract og:description
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            og_data["description"] = str(og_desc["content"]).strip()

        # Extract og:image
        og_image = soup.find("meta", property="og:image")
        if og_image and og_image.get("content"):
            og_data["image"] = str(og_image["content"]).strip()

        return og_data

    @staticmethod
    def _extract_meta_description(soup: BeautifulSoup) -> str | None:
        """Extract standard meta description."""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            return str(meta_desc["content"]).strip()
        return None

    @staticmethod
    def _extract_title(soup: BeautifulSoup) -> str | None:
        """Extract page title from <title> tag."""
        title_tag = soup.find("title")
        if title_tag and title_tag.string:
            return title_tag.string.strip()
        return None

    @staticmethod
    def _html_to_text(html_content: str) -> str:
        """Convert HTML content to plain text."""
        soup = BeautifulSoup(html_content, "lxml")
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        # Get text and clean up whitespace
        text = soup.get_text(separator="\n")
        # Clean up multiple newlines and spaces
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = "\n".join(chunk for chunk in chunks if chunk)
        return text

    @classmethod
    async def parse(cls, url: str) -> dict[str, Any]:
        """
        Parse a web page URL and extract structured content.

        Args:
            url: The URL to parse.

        Returns:
            dict containing:
                - title: Page title (prefers og:title, falls back to <title>)
                - description: Page description (prefers og:description, falls back to meta)
                - cover_image: Cover image URL (og:image)
                - content: Main article text (extracted via readability, converted to plain text)
                - source_url: Original URL
                - success: Boolean indicating if parsing succeeded
                - error: Error message if parsing failed

        Raises:
            No exceptions are raised; errors are returned in the response dict.
        """
        result: dict[str, Any] = {
            "title": None,
            "description": None,
            "cover_image": None,
            "content": None,
            "source_url": url,
            "success": False,
            "error": None,
        }

        try:
            # Fetch the page content
            async with httpx.AsyncClient(
                timeout=cls.TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": cls.USER_AGENT},
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
                html = response.text

            # Parse with BeautifulSoup for meta tags
            soup = BeautifulSoup(html, "lxml")

            # Extract OG meta tags
            og_data = cls._extract_og_meta(soup)

            # Set title (prefer og:title, fallback to <title>)
            result["title"] = og_data["title"] or cls._extract_title(soup)

            # Set description (prefer og:description, fallback to meta description)
            result["description"] = (
                og_data["description"] or cls._extract_meta_description(soup)
            )

            # Set cover image
            result["cover_image"] = og_data["image"]

            # Extract main content using readability
            doc = Document(html)
            article_html = doc.summary()

            # Convert to plain text
            result["content"] = cls._html_to_text(article_html)

            # If title is still None, try readability's title
            if not result["title"]:
                result["title"] = doc.title()

            result["success"] = True

        except httpx.TimeoutException:
            result["error"] = "请求超时，请检查网络连接或稍后重试"
        except httpx.HTTPStatusError as e:
            result["error"] = f"HTTP 错误: {e.response.status_code}"
        except httpx.RequestError as e:
            result["error"] = f"网络请求错误: {str(e)}"
        except Exception as e:
            result["error"] = f"解析错误: {str(e)}"

        return result
