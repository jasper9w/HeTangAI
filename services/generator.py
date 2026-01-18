"""
API Client for image, video, and audio generation
Supports streaming responses from gen-readme.md API
"""
import json
import base64
import asyncio
import re
import io
from pathlib import Path
from typing import Optional, List
import httpx
from loguru import logger

try:
    from PIL import Image
except ImportError:
    Image = None
    logger.warning("PIL not available, image compression will be disabled")


def compress_image_if_needed(image_path: str, max_size_kb: int = 256) -> str:
    """
    Compress image if it exceeds max_size_kb
    Returns base64 encoded image data

    Args:
        image_path: Path to image file
        max_size_kb: Maximum size in KB (default 256KB)
    """
    if not Image:
        # PIL not available, just encode without compression
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    try:
        # Read original image
        with open(image_path, "rb") as f:
            original_data = f.read()

        original_size_kb = len(original_data) / 1024

        # If already small enough, return as-is
        if original_size_kb <= max_size_kb:
            logger.info(f"Image size OK: {original_size_kb:.1f}KB <= {max_size_kb}KB")
            return base64.b64encode(original_data).decode("utf-8")

        logger.info(f"Image too large: {original_size_kb:.1f}KB > {max_size_kb}KB, compressing...")

        # Open image with PIL
        img = Image.open(image_path)

        # Convert RGBA to RGB if needed
        if img.mode == 'RGBA':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Try different quality levels
        for quality in [85, 75, 65, 55, 45, 35]:
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=quality, optimize=True)
            compressed_data = buffer.getvalue()
            compressed_size_kb = len(compressed_data) / 1024

            if compressed_size_kb <= max_size_kb:
                logger.info(f"Compressed to {compressed_size_kb:.1f}KB at quality {quality}")
                return base64.b64encode(compressed_data).decode("utf-8")

        # If still too large, resize image
        logger.warning(f"Quality reduction not enough, resizing image...")
        scale = (max_size_kb / compressed_size_kb) ** 0.5
        new_size = (int(img.width * scale), int(img.height * scale))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        final_data = buffer.getvalue()
        final_size_kb = len(final_data) / 1024

        logger.info(f"Resized and compressed to {final_size_kb:.1f}KB")
        return base64.b64encode(final_data).decode("utf-8")

    except Exception as e:
        logger.error(f"Failed to compress image: {e}, using original")
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")


def extract_url_from_markdown(markdown_text: str) -> Optional[str]:
    """
    Extract URL from markdown image format or HTML video tag
    Examples:
      - ![Generated Image](https://example.com/image.jpg) -> https://example.com/image.jpg
      - <video src='https://example.com/video.mp4' ... -> https://example.com/video.mp4
    """
    # Try markdown format first
    pattern = r'!\[.*?\]\((https?://[^\)]+)\)'
    match = re.search(pattern, markdown_text)
    if match:
        return match.group(1)

    # Try HTML video tag format
    video_pattern = r"<video\s+src=['\"]([^'\"]+)['\"]"
    match = re.search(video_pattern, markdown_text)
    if match:
        return match.group(1)

    # Try HTML img tag format
    img_pattern = r"<img\s+src=['\"]([^'\"]+)['\"]"
    match = re.search(img_pattern, markdown_text)
    if match:
        return match.group(1)

    return None


async def download_image_to_base64(url: str) -> str:
    """
    Download image from URL and convert to base64
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            image_bytes = response.content
            return base64.b64encode(image_bytes).decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to download image from {url}: {e}")
        raise


class GenerationClient:
    """Client for AI generation APIs"""

    def __init__(self, api_url: str, api_key: str, model: str):
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.timeout = 300.0  # 5 minutes timeout

    async def generate_image(
        self, prompt: str, reference_image: Optional[str] = None, count: int = 4
    ) -> List[str]:
        """
        Generate images using streaming API
        Returns list of image URLs (extracted from markdown format)

        Args:
            prompt: Text prompt for image generation
            reference_image: Optional base64 encoded reference image
            count: Number of images to generate (default 4)
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Build message content
        if reference_image:
            # Image-to-image
            content = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{reference_image}"},
                },
            ]
        else:
            # Text-to-image
            content = prompt

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "stream": True,
        }

        logger.info(f"Generating {count} images with model: {self.model}")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", self.api_url, headers=headers, json=payload
                ) as response:
                    response.raise_for_status()

                    images = []
                    current_content = ""

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            if current_content:
                                # Extract URL from markdown format
                                url = extract_url_from_markdown(current_content)
                                if url:
                                    images.append(url)
                            break

                        try:
                            data = json.loads(data_str)

                            # Extract content from response
                            if "choices" in data and len(data["choices"]) > 0:
                                choice = data["choices"][0]

                                # Check for delta content
                                if "delta" in choice and "content" in choice["delta"]:
                                    content_chunk = choice["delta"]["content"]
                                    if content_chunk:
                                        current_content += content_chunk

                                # Check for finish reason
                                if choice.get("finish_reason") == "stop":
                                    if current_content:
                                        # Extract URL from markdown format
                                        url = extract_url_from_markdown(current_content)
                                        if url:
                                            images.append(url)
                                        current_content = ""

                                        # Stop if we have enough images
                                        if len(images) >= count:
                                            break

                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse JSON: {e}, line: {data_str[:100]}")
                            continue

                    logger.info(f"Generated {len(images)} image URLs")
                    return images[:count]  # Return only requested count

        except Exception as e:
            logger.error(f"Failed to generate image: {e}")
            raise

    async def generate_video(
        self, prompt: str, image_paths: Optional[List[str]] = None
    ) -> str:
        """
        Generate video using streaming API
        Returns video URL (extracted from markdown format)

        Args:
            prompt: Text prompt for video generation
            image_paths: Optional list of image file paths (for I2V models)
                        - 1 image for first frame only
                        - 2 images for first/last frame models
                        - Multiple images for R2V models
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Build message content
        if image_paths:
            # Image-to-video or Reference-to-video
            content = [{"type": "text", "text": prompt}]

            for img_path in image_paths:
                # Compress image if needed (max 256KB)
                image_data = compress_image_if_needed(img_path, max_size_kb=256)

                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
                })

            logger.info(f"Using {len(image_paths)} image(s) for video generation")
        else:
            # Text-to-video
            content = prompt

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "stream": True,
        }

        logger.info(f"Generating video with model: {self.model}")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", self.api_url, headers=headers, json=payload
                ) as response:
                    response.raise_for_status()

                    current_content = ""
                    chunk_count = 0

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            logger.info("Received [DONE] signal")
                            break

                        try:
                            data = json.loads(data_str)
                            chunk_count += 1

                            # Log the raw chunk for debugging
                            logger.debug(f"Chunk {chunk_count}: {json.dumps(data)}")

                            if "choices" in data and len(data["choices"]) > 0:
                                choice = data["choices"][0]

                                # Accumulate content from delta
                                if "delta" in choice and "content" in choice["delta"]:
                                    content_chunk = choice["delta"]["content"]
                                    if content_chunk:
                                        current_content += content_chunk
                                        logger.debug(f"Accumulated content length: {len(current_content)}")

                                # Check for finish reason
                                if choice.get("finish_reason"):
                                    logger.info(f"Finish reason: {choice.get('finish_reason')}")

                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse JSON: {e}, line: {data_str[:100]}")
                            continue

                    # Log the complete accumulated content
                    logger.info(f"Total chunks received: {chunk_count}")
                    logger.info(f"Complete content length: {len(current_content)}")
                    logger.info(f"Complete content: {current_content[:500]}")

                    # Extract video URL from markdown format
                    video_url = extract_url_from_markdown(current_content)
                    if not video_url:
                        logger.error(f"Failed to extract URL from content: {current_content}")
                        raise ValueError("No video URL found in response")

                    logger.info(f"Generated video URL: {video_url[:100]}...")
                    return video_url

        except Exception as e:
            logger.error(f"Failed to generate video: {e}")
            raise

    async def generate_audio(
        self, text: str, reference_audio: Optional[str] = None, speed: float = 1.0
    ) -> bytes:
        """
        Generate audio using TTS API
        Returns audio bytes

        Args:
            text: Text to convert to speech
            reference_audio: Optional reference audio file path
            speed: Speech speed multiplier (default 1.0)
        """
        # TODO: Implement TTS API call based on actual API spec
        logger.info(f"Generating audio with speed: {speed}x")
        raise NotImplementedError("TTS API not yet implemented")


def save_base64_image(base64_data: str, output_path: Path):
    """Save base64 encoded image to file"""
    try:
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]

        image_bytes = base64.b64decode(base64_data)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "wb") as f:
            f.write(image_bytes)

        logger.info(f"Saved image to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to save image: {e}")
        raise


def save_base64_video(base64_data: str, output_path: Path):
    """Save base64 encoded video to file"""
    try:
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]

        video_bytes = base64.b64decode(base64_data)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "wb") as f:
            f.write(video_bytes)

        logger.info(f"Saved video to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to save video: {e}")
        raise


async def download_file(url: str, output_path: Path):
    """Download file from URL and save to path"""
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                f.write(response.content)

        logger.info(f"Downloaded file to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to download file from {url}: {e}")
        raise
