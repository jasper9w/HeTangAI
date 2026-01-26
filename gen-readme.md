## 📋 支持的模型

### 图片生成

| 模型名称 | 说明| 尺寸 |
|---------|--------|--------|
| `gemini-2.5-flash-image-landscape` | 图/文生图 | 横屏 |
| `gemini-2.5-flash-image-portrait` | 图/文生图 | 竖屏 |
| `gemini-3.0-pro-image-landscape` | 图/文生图 | 横屏 |
| `gemini-3.0-pro-image-portrait` | 图/文生图 | 竖屏 |
| `imagen-4.0-generate-preview-landscape` | 图/文生图 | 横屏 |
| `imagen-4.0-generate-preview-portrait` | 图/文生图 | 竖屏 |

### 视频生成

#### 文生视频 (T2V - Text to Video)
⚠️ **不支持上传图片**

| 模型名称 | 说明| 尺寸 |
|---------|---------|--------|
| `veo_3_1_t2v_fast_portrait` | 文生视频 | 竖屏 |
| `veo_3_1_t2v_fast_landscape` | 文生视频 | 横屏 |
| `veo_2_1_fast_d_15_t2v_portrait` | 文生视频 | 竖屏 |
| `veo_2_1_fast_d_15_t2v_landscape` | 文生视频 | 横屏 |
| `veo_2_0_t2v_portrait` | 文生视频 | 竖屏 |
| `veo_2_0_t2v_landscape` | 文生视频 | 横屏 |

#### 首尾帧模型 (I2V - Image to Video)
📸 **支持1-2张图片：首尾帧**

| 模型名称 | 说明| 尺寸 |
|---------|---------|--------|
| `veo_3_1_i2v_s_fast_fl_portrait` | 图生视频 | 竖屏 |
| `veo_3_1_i2v_s_fast_fl_landscape` | 图生视频 | 横屏 |
| `veo_2_1_fast_d_15_i2v_portrait` | 图生视频 | 竖屏 |
| `veo_2_1_fast_d_15_i2v_landscape` | 图生视频 | 横屏 |
| `veo_2_0_i2v_portrait` | 图生视频 | 竖屏 |
| `veo_2_0_i2v_landscape` | 图生视频 | 横屏 |

#### 多图生成 (R2V - Reference Images to Video)
🖼️ **支持多张图片**

| 模型名称 | 说明| 尺寸 |
|---------|---------|--------|
| `veo_3_0_r2v_fast_portrait` | 图生视频 | 竖屏 |
| `veo_3_0_r2v_fast_landscape` | 图生视频 | 横屏 |

## 📡 API 使用示例（需要使用流式）

### 文生图

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash-image-landscape",
    "messages": [
      {
        "role": "user",
        "content": "一只可爱的猫咪在花园里玩耍"
      }
    ],
    "stream": true
  }'
```

### 图生图

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "imagen-4.0-generate-preview-landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "将这张图片变成水彩画风格"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<base64_encoded_image>"
            }
          }
        ]
      }
    ],
    "stream": true
  }'
```

### 文生视频

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo_3_1_t2v_fast_landscape",
    "messages": [
      {
        "role": "user",
        "content": "一只小猫在草地上追逐蝴蝶"
      }
    ],
    "stream": true
  }'
```

### 首尾帧生成视频

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo_3_1_i2v_s_fast_fl_landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "从第一张图过渡到第二张图"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<首帧base64>"
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<尾帧base64>"
            }
          }
        ]
      }
    ],
    "stream": true
  }'
```


关于输出
```

data: {"id": "chatcmpl-task_0_125546194334", "object": "chat.completion.chunk", "created": 1769403367, "model": "gemini-2.5-flash-image-landscape", "choices": [{"index": 0, "delta": {"role": null, "content": "[进度 65%]\n"}, "finish_reason": null}]}

data: {"id": "chatcmpl-task_0_125546194334", "object": "chat.completion.chunk", "created": 1769403368, "model": "gemini-2.5-flash-image-landscape", "choices": [{"index": 0, "delta": {"role": null, "content": "[下载中...]\n"}, "finish_reason": null}]}

data: {"id": "chatcmpl-task_0_125546194334", "object": "chat.completion.chunk", "created": 1769403369, "model": "gemini-2.5-flash-image-landscape", "choices": [{"index": 0, "delta": {"role": null, "content": "![Generated Image](http://localhost:8000/files/task_0_125546194334)"}, "finish_reason": "stop"}]}
```

可见，对于生图类任务，如果输出中 content 包含 ![Generated Image](https://example.com/image.jpg) 这种 内容，说明图片生成完成了，直接提取其链接和下载

如果是视频类任务，则格式如 <video src='https://example.com/video.mp4' ...>

即提取方式是
Examples:
  - ![Generated Image](https://example.com/image.jpg) -> https://example.com/image.jpg
  - <video src='https://example.com/video.mp4' ... -> https://example.com/video.mp4
"""