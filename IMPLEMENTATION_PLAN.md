# 工作目录和真实接口集成实现计划

## 1. 目录结构设计

### 工作目录
- 默认位置：`~/Desktop/荷塘AI/`
- 可在设置中修改

### 项目目录结构
```
~/Desktop/荷塘AI/
├── test/                    # 项目目录（项目名）
│   ├── project.json        # 项目状态文件
│   ├── 角色/               # 角色图片目录
│   │   ├── char_xxx.jpg
│   │   └── narrator.jpg
│   └── 镜头/               # 镜头资源目录
│       ├── shot_image_001.jpeg      # 主图（第一张备选图）
│       ├── shot_image_001_01.jpeg   # 备选图1
│       ├── shot_image_001_02.jpeg   # 备选图2
│       ├── shot_image_001_03.jpeg   # 备选图3
│       ├── shot_video_001.mp4       # 视频
│       ├── shot_audio_001.wav       # 配音
│       ├── shot_image_002.jpeg
│       └── ...
```

## 2. 文件命名规范

### 镜头资源
- 主图：`shot_image_{序号}.jpeg`（序号补零到3位）
- 备选图：`shot_image_{序号}_{备选序号}.jpeg`（备选序号从01开始）
- 视频：`shot_video_{序号}.mp4`
- 配音：`shot_audio_{序号}.wav`

### 角色资源
- 角色图：`{角色ID}.jpg`

## 3. 设置界面修改

### 新增配置项
- 工作目录路径
- 选择目录按钮

### 配置文件更新
```json
{
  "workDir": "~/Desktop/荷塘AI",
  "tts": { ... },
  "tti": { ... },
  "ttv": { ... }
}
```

## 4. 项目管理重构

### project.json 格式
```json
{
  "version": "1.0",
  "name": "test",
  "createdAt": "2024-01-01T00:00:00",
  "updatedAt": "2024-01-01T00:00:00",
  "characters": [...],
  "shots": [...]
}
```

### API 方法调整
- `new_project()` - 创建项目目录和子目录
- `save_project()` - 保存到项目目录的 project.json
- `open_project()` - 从项目目录加载
- 所有生成方法 - 保存文件到对应目录

## 5. 真实接口集成

### 图片生成服务
- 使用 gen-readme.md 中的 `/v1/chat/completions` 接口
- 支持流式响应
- 生成4张备选图
- 保存为 shot_image_{序号}_{01-04}.jpeg
- 第一张作为主图

### 视频生成服务
- 使用 I2V 模型（图生视频）
- 使用选中的主图作为输入
- 保存为 shot_video_{序号}.mp4

### 配音生成服务
- TTS 接口
- 使用角色的参考音和倍速
- 保存为 shot_audio_{序号}.wav

## 6. 实现步骤

### Phase 1: 设置界面和工作目录
1. 更新 SettingsPage 添加工作目录配置
2. 更新 settings.json 结构
3. 添加选择目录功能

### Phase 2: 项目目录结构
1. 创建项目目录管理服务
2. 实现文件命名工具函数
3. 更新项目保存/加载逻辑

### Phase 3: 真实接口集成
1. 创建 API 客户端服务
2. 实现图片生成（4张备选图）
3. 实现视频生成（使用主图）
4. 实现配音生成

### Phase 4: 文件管理
1. 图片保存到镜头目录
2. 视频保存到镜头目录
3. 配音保存到镜头目录
4. 角色图保存到角色目录

## 7. 关键文件

### 前端
- `web-src/src/pages/SettingsPage.tsx` - 添加工作目录配置
- `web-src/src/types.ts` - 更新类型定义

### 后端
- `api.py` - 更新项目管理方法
- `services/generator.py` - 新建真实生成服务
- `services/file_manager.py` - 新建文件管理服务
- `services/api_client.py` - 新建 API 客户端

## 8. 注意事项

1. 向后兼容 - 旧项目文件需要能够迁移
2. 错误处理 - 网络错误、API 错误、文件系统错误
3. 进度反馈 - 生成过程中的进度更新
4. 并发控制 - 使用设置中的并发数
5. 文件清理 - 删除镜头时清理相关文件
