"""
Mock generators for images and videos (placeholder implementation)
"""
import random
import time

from loguru import logger


class MockImageGenerator:
    """Mock image generator that returns placeholder images"""

    def generate(self, prompt: str, count: int = 4) -> list:
        """
        Generate mock images

        Args:
            prompt: The image generation prompt (ignored in mock)
            count: Number of images to generate

        Returns:
            List of placeholder image URLs
        """
        logger.info(f"Mock generating {count} images for prompt: {prompt[:50]}...")

        # Simulate generation delay
        time.sleep(0.3)

        # Generate placeholder URLs using picsum.photos
        images = []
        for i in range(count):
            seed = random.randint(1000, 9999)
            # 16:9 aspect ratio images
            url = f"https://picsum.photos/seed/{seed}/640/360"
            images.append(url)

        logger.info(f"Generated {count} mock images")
        return images


class MockCharacterGenerator:
    """Mock character 3-view image generator"""

    def generate(self, prompt: str) -> str:
        """
        Generate mock character 3-view image

        Args:
            prompt: Character description for generation

        Returns:
            Placeholder image URL (3:1 aspect ratio for 3 views)
        """
        logger.info(f"Mock generating character 3-view for: {prompt[:50]}...")

        # Simulate generation delay
        time.sleep(0.5)

        # Generate placeholder URL - 3:1 aspect ratio for 3 views (front, side, back)
        seed = random.randint(1000, 9999)
        url = f"https://picsum.photos/seed/{seed}/900/300"

        logger.info("Generated mock character 3-view image")
        return url


class MockVideoGenerator:
    """Mock video generator that returns placeholder video"""

    def generate(self, prompt: str, image_url: str = "") -> str:
        """
        Generate mock video

        Args:
            prompt: The video generation prompt (ignored in mock)
            image_url: The base image URL (ignored in mock)

        Returns:
            Placeholder video URL
        """
        logger.info(f"Mock generating video for prompt: {prompt[:50]}...")

        # Simulate generation delay
        time.sleep(0.5)

        # Return a placeholder video URL
        # In production, this would be a real video file path
        video_url = "mock://video_placeholder.mp4"

        logger.info("Generated mock video")
        return video_url
