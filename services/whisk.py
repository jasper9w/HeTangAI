import requests
import base64
import random
import time
import json
from typing import Optional, Generator
from dataclasses import dataclass
from enum import Enum


class VideoStatus(Enum):
    PENDING = "MEDIA_GENERATION_STATUS_PENDING"
    ACTIVE = "MEDIA_GENERATION_STATUS_ACTIVE"
    SUCCESSFUL = "MEDIA_GENERATION_STATUS_SUCCESSFUL"
    FAILED = "MEDIA_GENERATION_STATUS_FAILED"


@dataclass
class WhiskImage:
    encoded_image: str
    seed: int
    media_generation_id: str
    prompt: str
    image_model: str
    workflow_id: str
    aspect_ratio: str

    def save(self, filepath: str):
        image_data = base64.b64decode(self.encoded_image)
        with open(filepath, 'wb') as f:
            f.write(image_data)


@dataclass
class VideoProgress:
    status: VideoStatus
    operation_name: str
    elapsed_seconds: float


@dataclass
class WhiskVideo:
    encoded_video: str
    media_generation_id: str

    def save(self, filepath: str):
        video_data = base64.b64decode(self.encoded_video)
        with open(filepath, 'wb') as f:
            f.write(video_data)


class WhiskVideoError(Exception):
    def __init__(self, message: str, code: Optional[int] = None):
        self.message = message
        self.code = code
        super().__init__(message)


class Whisk:
    BASE_URL = "https://aisandbox-pa.googleapis.com/v1"
    UPLOAD_URL = "https://labs.google/fx/api/trpc/backbone.uploadImage"
    
    def __init__(self, token: str, workflow_id: str):
        self.token = token
        self.workflow_id = workflow_id
        self.session_id = f";{random.randint(1000000000000, 9999999999999)}"
    
    def _get_headers(self) -> dict:
        return {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "authorization": f"Bearer {self.token}",
            "content-type": "text/plain;charset=UTF-8",
            "origin": "https://labs.google",
            "priority": "u=1, i",
            "referer": "https://labs.google/",
            "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
            "x-browser-channel": "stable",
            "x-browser-copyright": "Copyright 2026 Google LLC. All Rights reserved.",
            "x-browser-validation": "faSnjNH7fC/xdlb/Sn0NGaZBGzA=",
            "x-browser-year": "2026",
            "x-client-data": "CKe1yQEIiLbJAQijtskBCKmdygEI/vzKAQiVocsBCIagzQEI2qrPAQ==",
        }
    
    def _get_client_context(self) -> dict:
        return {
            "sessionId": self.session_id,
            "tool": "BACKBONE",
            "workflowId": self.workflow_id
        }

    def _get_upload_headers(self, cookie: str) -> dict:
        """Get headers for upload API (different from generation API)"""
        return {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "origin": "https://labs.google",
            "priority": "u=1, i",
            "referer": f"https://labs.google/fx/tools/whisk/project/{self.workflow_id}",
            "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
            "cookie": cookie,
        }

    def upload_image(
        self,
        image_path: str,
        media_category: str = "MEDIA_CATEGORY_STYLE",
        cookie: Optional[str] = None
    ) -> str:
        """
        Upload an image to Whisk and get its media_generation_id.
        
        Args:
            image_path: Path to the image file
            media_category: Category of the media (MEDIA_CATEGORY_STYLE, MEDIA_CATEGORY_SUBJECT, MEDIA_CATEGORY_SCENE)
            cookie: Session cookie for authentication (required for upload API)
        
        Returns:
            uploadMediaGenerationId string
        """
        if not cookie:
            raise ValueError("Cookie is required for upload API")

        # Read and encode the image
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        
        # Detect image type
        if image_path.lower().endswith('.png'):
            mime_type = "image/png"
        elif image_path.lower().endswith(('.jpg', '.jpeg')):
            mime_type = "image/jpeg"
        elif image_path.lower().endswith('.webp'):
            mime_type = "image/webp"
        elif image_path.lower().endswith('.gif'):
            mime_type = "image/gif"
        else:
            mime_type = "image/png"  # Default to PNG
        
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        raw_bytes = f"data:{mime_type};base64,{encoded_image}"
        
        payload = {
            "json": {
                "clientContext": {
                    "workflowId": self.workflow_id,
                    "sessionId": self.session_id
                },
                "uploadMediaInput": {
                    "mediaCategory": media_category,
                    "rawBytes": raw_bytes,
                    "caption": ""
                }
            }
        }
        
        response = requests.post(
            self.UPLOAD_URL,
            headers=self._get_upload_headers(cookie),
            json=payload
        )
        response.raise_for_status()
        
        data = response.json()
        # Parse response: {"result":{"data":{"json":{"result":{"uploadMediaGenerationId":"xxx"},"status":200}}}}
        result = data.get("result", {}).get("data", {}).get("json", {}).get("result", {})
        upload_id = result.get("uploadMediaGenerationId")
        
        if not upload_id:
            raise ValueError(f"Failed to get uploadMediaGenerationId from response: {data}")
        
        return upload_id

    def upload_image_bytes(
        self,
        image_bytes: bytes,
        mime_type: str = "image/png",
        media_category: str = "MEDIA_CATEGORY_STYLE",
        cookie: Optional[str] = None
    ) -> str:
        """
        Upload image bytes to Whisk and get its media_generation_id.
        
        Args:
            image_bytes: Raw image bytes
            mime_type: MIME type of the image
            media_category: Category of the media
            cookie: Session cookie for authentication
        
        Returns:
            uploadMediaGenerationId string
        """
        if not cookie:
            raise ValueError("Cookie is required for upload API")
        
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        raw_bytes = f"data:{mime_type};base64,{encoded_image}"
        
        payload = {
            "json": {
                "clientContext": {
                    "workflowId": self.workflow_id,
                    "sessionId": self.session_id
                },
                "uploadMediaInput": {
                    "mediaCategory": media_category,
                    "rawBytes": raw_bytes,
                    "caption": ""
                }
            }
        }
        
        response = requests.post(
            self.UPLOAD_URL,
            headers=self._get_upload_headers(cookie),
            json=payload
        )
        response.raise_for_status()
        
        data = response.json()
        result = data.get("result", {}).get("data", {}).get("json", {}).get("result", {})
        upload_id = result.get("uploadMediaGenerationId")
        
        if not upload_id:
            raise ValueError(f"Failed to get uploadMediaGenerationId from response: {data}")
        
        return upload_id

    def generate_image(
        self,
        prompt: str,
        media_category: str = "MEDIA_CATEGORY_STYLE", # MEDIA_CATEGORY_SUBJECT, MEDIA_CATEGORY_SCENE, MEDIA_CATEGORY_STYLE
        aspect_ratio: str = "IMAGE_ASPECT_RATIO_LANDSCAPE", # IMAGE_ASPECT_RATIO_LANDSCAPE
        image_model: str = "IMAGEN_3_5"
    ) -> WhiskImage:
        payload = {
            "clientContext": self._get_client_context(),
            "imageModelSettings": {
                "imageModel": image_model,
                "aspectRatio": aspect_ratio
            },
            "prompt": prompt,
            "mediaCategory": media_category
        }
        
        print("generate_image prompt", prompt)
        response = requests.post(
            f"{self.BASE_URL}/whisk:generateImage",
            headers=self._get_headers(),
            data=json.dumps(payload)
        )
        response.raise_for_status()
        return self._parse_image_response(response.json())

    def generate_with_references(
        self,
        prompt: str,
        subject_ids: Optional[list[str]] = None,
        scene_ids: Optional[list[str]] = None,
        style_ids: Optional[list[str]] = None,
        aspect_ratio: str = "IMAGE_ASPECT_RATIO_LANDSCAPE",
        seed: Optional[int] = None
    ) -> WhiskImage:
        """
        Generate image with reference images.
        
        Args:
            prompt: User instruction/prompt
            subject_ids: List of media_generation_id for subject references
            scene_ids: List of media_generation_id for scene references
            style_ids: List of media_generation_id for style references
            aspect_ratio: Image aspect ratio
            seed: Random seed (auto-generated if not provided)
        
        Returns:
            List of generated WhiskImage objects
        """
        recipe_inputs = []
        
        for ids, category in [
            (subject_ids, "MEDIA_CATEGORY_SUBJECT"),
            (scene_ids, "MEDIA_CATEGORY_SCENE"),
            (style_ids, "MEDIA_CATEGORY_STYLE")
        ]:
            if ids:
                for media_id in ids:
                    recipe_inputs.append({
                        "caption": "",
                        "mediaInput": {
                            "mediaCategory": category,
                            "mediaGenerationId": media_id
                        }
                    })
        
        payload = {
            "clientContext": self._get_client_context(),
            "seed": seed or random.randint(100000, 999999),
            "imageModelSettings": {
                "imageModel": "R2I",
                "aspectRatio": aspect_ratio
            },
            "userInstruction": prompt,
            "recipeMediaInputs": recipe_inputs
        }

        import json
        print("payload", json.dumps(payload, indent=4, ensure_ascii=False))
        
        response = requests.post(
            f"{self.BASE_URL}/whisk:runImageRecipe",
            headers=self._get_headers(),
            data=json.dumps(payload)
        )
        response.raise_for_status()
        return self._parse_image_response(response.json())

    def generate_video(
        self,
        prompt: str,
        image_bytes: bytes,
        poll_interval: float = 5.0,
        initial_wait: float = 5.0
    ) -> Generator[VideoProgress | WhiskVideo, None, None]:
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        
        payload = {
            "clientContext": self._get_client_context(),
            "promptImageInput": {
                "prompt": prompt,
                "rawBytes": encoded_image
            },
            "modelNameType": "VEO_3_1_I2V_12STEP",
            "modelKey": "",
            "userInstructions": prompt,
            "loopVideo": False
        }
        
        response = requests.post(
            f"{self.BASE_URL}/whisk:generateVideo",
            headers=self._get_headers(),
            data=json.dumps(payload)
        )
        
        if not response.ok:
            raise WhiskVideoError(f"Request failed: {response.status_code} - {response.text}")
        
        data = response.json()
        
        # 正确解析嵌套的 operation name: data['operation']['operation']['name']
        operation_name = data.get("operation", {}).get("operation", {}).get("name")
        if not operation_name:
            raise WhiskVideoError(f"No operation name in response: {data}")
        
        start_time = time.time()
        
        # 初始等待
        yield VideoProgress(VideoStatus.PENDING, operation_name, 0)
        time.sleep(initial_wait)
        
        while True:
            elapsed = time.time() - start_time
            
            check_payload = {"operations": [{"operation": {"name": operation_name}}]}
            
            check_response = requests.post(
                f"{self.BASE_URL}:runVideoFxSingleClipsStatusCheck",
                headers=self._get_headers(),
                data=json.dumps(check_payload)
            )
            check_response.raise_for_status()
            status_data = check_response.json()
            status_str = status_data.get("status", "")
            
            if status_str in (VideoStatus.ACTIVE.value, VideoStatus.PENDING.value):
                yield VideoProgress(VideoStatus.ACTIVE, operation_name, elapsed)
                time.sleep(poll_interval)
                continue
            
            if status_str == VideoStatus.FAILED.value:
                ops = status_data.get("operations", [])
                error = ops[0].get("operation", {}).get("error", {}) if ops else {}
                raise WhiskVideoError(error.get("message", "Failed"), error.get("code"))
            
            if status_str == VideoStatus.SUCCESSFUL.value:
                ops = status_data.get("operations", [])
                if ops:
                    yield WhiskVideo(ops[0].get("rawBytes", ""), ops[0].get("mediaGenerationId", ""))
                    return
                raise WhiskVideoError("Success but no data")
            
            # 未知状态，继续轮询
            yield VideoProgress(VideoStatus.ACTIVE, operation_name, elapsed)
            time.sleep(poll_interval)

    def generate_video_from_file(
        self,
        prompt: str,
        image_path: str,
        poll_interval: float = 5.0
    ) -> Generator[VideoProgress | WhiskVideo, None, None]:
        with open(image_path, 'rb') as f:
            yield from self.generate_video(prompt, f.read(), poll_interval)

    def generate_video_from_generated_image(
        self,
        prompt: str,
        whisk_image: WhiskImage,
        poll_interval: float = 5.0
    ) -> Generator[VideoProgress | WhiskVideo, None, None]:
        yield from self.generate_video(prompt, base64.b64decode(whisk_image.encoded_image), poll_interval)

    def _parse_image_response(self, data: dict) -> WhiskImage:
        images = []
        for panel in data.get("imagePanels", []):
            for img in panel.get("generatedImages", []):
                images.append(WhiskImage(
                    encoded_image=img["encodedImage"],
                    seed=img["seed"],
                    media_generation_id=img["mediaGenerationId"],
                    prompt=img.get("prompt", ""),
                    image_model=img["imageModel"],
                    workflow_id=img["workflowId"],
                    aspect_ratio=img["aspectRatio"]
                ))
        return images[0]


if __name__ == "__main__":
    TOKEN = "ya29.xxx"
    TOKEN="ya29.a0AUMWg_K4t-htGti3sJuq0dMld2WJebtKp7y4UA1mjFfSaYLmoal79eZlLBbFo_qPv9blWapswPAa6eFwpRE75OyRkfkPS6UgcwEG0FkctFjvdvTinZ7IrckBbOF8MB9nGbCoP7lvfe9zvijhv9A9cLqMfnaWuVP3BFR7ZNB_FtC2BVLxwg_F7EB0dwCDwCrs45dcLYkQUQ9uN9JgV3I0cassLNylb3OJNANNT-IHcSaClfx0z88xc42bXAVzwnkpAgVppdc0XzKb_oDsNhR7c8iM68D0ZW_jBdnu6UWwPF72zgH0dBDYjSTGWcRbhbaZTHJBijrGvmjm3z9d0fNY4hIub23xic46AbtRhKyLRmEaCgYKAUISARESFQHGX2MiQyVpilStBWVzxb76w6tMcQ0370"

    WORKFLOW_ID = "8717fe5a-b2ae-481f-bba8-26e0eb0898b7"
    
    whisk = Whisk(TOKEN, WORKFLOW_ID)
    
    try:
        
        whisk_image = whisk.generate_with_references(
            prompt="组合一下",
            subject_ids=["CAMaJDg3MTdmZTVhLWIyYWUtNDgxZi1iYmE4LTI2ZTBlYjA4OThiNyIEQ0p3RCokOWMxOWM2NzgtMjQ0Yy00ZTI4LWIzODktZjdjZTYwZWNiN2Vl"],
            scene_ids=["CAMaJDg3MTdmZTVhLWIyYWUtNDgxZi1iYmE4LTI2ZTBlYjA4OThiNyIDQ0JnKiQ5YjM3MTdlNi0xYzg2LTQ2NGEtOWVjYy05ZDdmZTg1ZjFhZDE"],
            style_ids=["CAMaJDg3MTdmZTVhLWIyYWUtNDgxZi1iYmE4LTI2ZTBlYjA4OThiNyIEQ0o0RCokYmQ2ZjgyNWQtYWZmMC00OTA4LWE0MWQtYzA0YTFhNjU3ZTY2"]
        )
        whisk_image.save("1.jpg")
        # for result in whisk.generate_video_from_file("让它动起来", "test.jpg"):
        #     if isinstance(result, VideoProgress):
        #         print(f"进行中... {result.elapsed_seconds:.1f}s")
        #     elif isinstance(result, WhiskVideo):
        #         result.save("output.mp4")
        #         print("完成!")
    except WhiskVideoError as e:
        print(f"失败: {e.message}")