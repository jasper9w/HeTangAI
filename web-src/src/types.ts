/**
 * Type definitions for AI Lens Creation Workshop
 */

// ========== Page Types ==========

export type PageType = 'projects' | 'home' | 'projectSettings' | 'storyboard' | 'characters' | 'scenes' | 'shots' | 'dubbing' | 'settings';

// ========== Task Types (moved to top for forward reference) ==========

export type TaskType = 'image' | 'video' | 'audio';

export type TaskStatus = 'pending' | 'paused' | 'running' | 'success' | 'failed' | 'cancelled';

export interface TaskBase {
  id: string;
  task_type: TaskType;
  subtype: string;
  status: TaskStatus;
  priority: number;
  depends_on: string | null;
  result_url: string | null;
  result_local_path: string | null;
  error: string | null;
  max_retries: number;
  retry_count: number;
  timeout_seconds: number;
  expire_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

export interface ImageTask extends TaskBase {
  task_type: 'image';
  prompt: string;
  aspect_ratio: string;
  resolution: string | null;
  reference_images: string | null;
  provider: string;
  output_dir: string | null;
  shot_id: string | null;
  shot_sequence: number | null;
  slot: number | null;
  processed: number;
}

export interface VideoTask extends TaskBase {
  task_type: 'video';
  prompt: string;
  aspect_ratio: string;
  resolution: string | null;
  reference_images: string | null;
  duration: number;
  provider: string;
  output_dir: string | null;
  shot_id: string | null;
  shot_sequence: number | null;
  processed: number;
}

export interface AudioTask extends TaskBase {
  task_type: 'audio';
  text: string;
  voice_ref: string | null;
  emotion: string | null;
  emotion_intensity: string | null;
  speed: number;
  provider: string;
  output_dir: string | null;
  result_duration_ms: number | null;
  shot_id: string | null;
  shot_sequence: number | null;
  dialogue_index: number | null;
  processed: number;
}

export type Task = ImageTask | VideoTask | AudioTask;

export interface TaskSummary {
  image: Record<TaskStatus, number>;
  video: Record<TaskStatus, number>;
  audio: Record<TaskStatus, number>;
  total: Record<TaskStatus, number>;
}

// ========== Shot Types ==========

export type ShotStatus =
  | 'pending'
  | 'generating_images'
  | 'images_ready'
  | 'generating_video'
  | 'generating_audio'
  | 'completed'
  | 'error';

export interface Dialogue {
  role: string;      // 角色名称
  text: string;      // 对话文本
  audioUrl?: string; // 该对话的配音URL（可选）
  emotion?: string;  // 情感类型（开心/悲伤/愤怒/惊讶/恐惧/厌恶/平静）
  intensity?: string; // 情感强度（0.0-0.5）
}

export interface Shot {
  id: string;  // 6位随机字符，用于文件命名
  sequence: number;
  scene?: string;    // 场景名称（新增）
  voiceActor: string;
  characters: string[];
  emotion: string;
  intensity: string;
  script: string;
  dialogues?: Dialogue[];  // 对话数组（新增）
  imagePrompt: string;
  videoPrompt: string;
  images: string[];  // 备选图URL数组，最多4个
  imageSourceUrls?: string[]; // 备选图原始URL数组，最多4个
  imageMediaGenerationIds?: string[]; // Whisk返回的media_generation_id数组
  selectedImageIndex: number;  // 选中的备选图索引
  videos: string[];  // 备选视频URL数组，最多4个
  selectedVideoIndex: number;  // 选中的备选视频索引
  videoUrl: string;     // 视频文件URL
  audioUrl: string;     // 配音文件URL
  // 视频编辑参数
  videoSpeed?: number;      // 视频倍速，默认根据音频计算
  audioSpeed?: number;      // 音频倍速，默认 1
  audioOffset?: number;     // 音频相对视频开始的偏移（秒），默认 0
  audioTrimStart?: number;  // 音频裁剪起点（秒），默认 0
  audioTrimEnd?: number;    // 音频裁剪终点（秒），默认为音频时长
  audioDuration?: number;   // 音频时长（秒）
  videoDuration?: number;   // 视频时长（秒）
  remark?: string;          // 备注
  status: ShotStatus;
  errorMessage?: string;
}

// ========== Character Types ==========

export type CharacterStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface Character {
  id: string;
  name: string;
  description: string;  // 用于生成3视图的提示词
  imageUrl: string;     // 3视图图片URL
  imageSourceUrl?: string; // 3视图图片原始URL
  imageMediaGenerationId?: string; // Whisk返回的media_generation_id
  referenceAudioPath?: string;  // 参考音文件路径
  referenceAudioName?: string;  // 参考音名称（用于显示）
  audioRecommendations?: AudioRecommendation[];  // 大模型推荐的参考音列表
  selectedRecommendationIndex?: number;  // 当前选中的推荐索引（0-based）
  speed: number;        // 配音倍速，默认1.0
  isNarrator: boolean;  // 是否为旁白角色
  status: CharacterStatus;
  errorMessage?: string;
}

// ========== Scene Types ==========

export type SceneStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface Scene {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  imageSourceUrl?: string;
  imageMediaGenerationId?: string;
  status: SceneStatus;
  errorMessage?: string;
}

export interface ImportedCharacter extends Partial<Character> {
  existingId?: string;
  isDuplicate?: boolean;
}

// ========== Project Types ==========

export interface ProjectListItem {
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  shotCount: number;
  characterCount: number;
}

export interface ProjectData {
  version: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  promptPrefixes?: {
    shotImagePrefix: string;
    shotVideoPrefix: string;
    characterPrefix: string;
  };
  settings?: ProjectSettings;  // 项目基础设定
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
}

// ========== API Response Types ==========

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
  name?: string;
  path?: string;
}

export interface ShotBuilderPrompts {
  role: string;
  scene: string;
  shot: string;
}

export interface ShotBuilderRunResult {
  success: boolean;
  error?: string;
  step?: 'role' | 'scene' | 'shot';
  running?: boolean;
  outputDir?: string;
}

export interface ShotBuilderStatus {
  success: boolean;
  error?: string;
  step?: 'role' | 'scene' | 'shot' | null;
  running: boolean;
  outputDir?: string;
  counts?: {
    roles: number;
    scenes: number;
    shots: number;
  };
}

export interface ShotBuilderImportResult {
  success: boolean;
  error?: string;
  importedCount?: number;
  overwrittenCount?: number;
  skippedCount?: number;
  conflicts?: { id: string; name?: string }[];
  total?: number;
}

export interface ShotBuilderOutputs {
  roles: string;
  scenes: string;
  shots: string;
  outputDir?: string;
}

export interface ImportResult {
  success: boolean;
  count: number;
  characters: string[];
  errors: string[];
  data?: ProjectData;
}

export interface GenerateResult {
  success: boolean;
  images?: string[];
  videoUrl?: string;
  audioUrl?: string;
  shot?: Shot;
  error?: string;
}

export interface BatchGenerateResult {
  success: boolean;
  task_ids?: string[];
  errors?: string[];
  message?: string;
  error?: string;
}

// ========== PyWebView API Interface ==========

export interface PyWebViewApi {
  // Project management
  new_project: () => Promise<ApiResponse<ProjectData>>;
  open_project: () => Promise<ApiResponse<ProjectData> & { path?: string }>;
  save_project: () => Promise<ApiResponse & { path?: string }>;
  save_project_as: () => Promise<ApiResponse & { path?: string }>;
  get_project_data: () => Promise<ApiResponse<ProjectData> & { path?: string | null; name?: string | null }>;
  update_project_name: (name: string) => Promise<ApiResponse>;

  // Work directory project management
  list_projects: () => Promise<ApiResponse & { projects?: ProjectListItem[] }>;
  open_project_from_workdir: (projectName: string) => Promise<ApiResponse<ProjectData> & { name?: string }>;
  save_project_to_workdir: (projectName?: string) => Promise<ApiResponse & { name?: string; path?: string }>;
  delete_project_from_workdir: (projectName: string) => Promise<ApiResponse>;
  rename_project_in_workdir: (oldName: string, newName: string) => Promise<ApiResponse & { name?: string }>;

  // Import/Export
  import_jsonl: () => Promise<ImportResult>;
  export_jsonl_template: () => Promise<ApiResponse & { path?: string }>;
  import_excel: () => Promise<ImportResult>;
  export_excel_template: () => Promise<ApiResponse & { path?: string }>;

  // Character management
  add_character: (name: string, description?: string) => Promise<ApiResponse & { character?: Character }>;
  update_character: (characterId: string, name: string, description: string) => Promise<ApiResponse & { character?: Character }>;
  update_character_speed: (characterId: string, speed: number) => Promise<ApiResponse & { character?: Character }>;
  delete_character: (characterId: string) => Promise<ApiResponse>;
  generate_character_image: (characterId: string) => Promise<ApiResponse & { imageUrl?: string; character?: Character }>;
  generate_characters_batch: (characterIds: string[]) => Promise<BatchGenerateResult>;
  upload_character_image: (characterId: string) => Promise<ApiResponse & { imageUrl?: string; character?: Character }>;
  set_character_reference_audio: (characterId: string, audioPath: string) => Promise<ApiResponse & { character?: Character }>;

  // Character import
  import_characters_from_text: (text: string) => Promise<ApiResponse & { characters?: ImportedCharacter[]; errors?: string[] }>;
  import_characters_from_file: () => Promise<ApiResponse & { characters?: ImportedCharacter[]; errors?: string[] }>;
  confirm_import_characters: (characters: ImportedCharacter[]) => Promise<ApiResponse & { addedCount?: number }>;
  export_character_template: () => Promise<ApiResponse & { path?: string }>;

  // Scene management
  add_scene: (name: string, prompt?: string) => Promise<ApiResponse & { scene?: Scene }>;
  update_scene: (sceneId: string, name: string, prompt: string) => Promise<ApiResponse & { scene?: Scene }>;
  delete_scene: (sceneId: string) => Promise<ApiResponse>;
  generate_scene_image: (sceneId: string) => Promise<ApiResponse & { imageUrl?: string; scene?: Scene }>;
  upload_scene_image: (sceneId: string) => Promise<ApiResponse & { imageUrl?: string; scene?: Scene }>;

  // Shot management
  update_shot: (shotId: string, field: string, value: unknown) => Promise<ApiResponse & { shot?: Shot }>;
  delete_shots: (shotIds: string[]) => Promise<ApiResponse & { deletedCount?: number }>;
  select_image: (shotId: string, imageIndex: number) => Promise<ApiResponse>;
  select_video: (shotId: string, videoIndex: number) => Promise<ApiResponse>;
  delete_shot_image: (shotId: string, imageIndex: number) => Promise<ApiResponse & { shot?: Shot }>;
  delete_shot_video: (shotId: string, videoIndex: number) => Promise<ApiResponse & { shot?: Shot }>;
  insert_shot: (afterShotId: string | null) => Promise<ApiResponse & { shots?: Shot[] }>;

  // Shot builder one-click import
  import_shot_builder_roles: (strategy?: 'overwrite' | 'skip' | 'cancel') => Promise<ShotBuilderImportResult>;
  import_shot_builder_scenes: (strategy?: 'overwrite' | 'skip' | 'cancel') => Promise<ShotBuilderImportResult>;
  import_shot_builder_shots: (strategy?: 'overwrite' | 'skip' | 'cancel') => Promise<ShotBuilderImportResult>;

  // Generation
  generate_images_for_shot: (shotId: string) => Promise<GenerateResult>;
  generate_images_batch: (shotIds: string[]) => Promise<BatchGenerateResult>;
  generate_video_for_shot: (shotId: string) => Promise<GenerateResult>;
  generate_videos_batch: (shotIds: string[]) => Promise<BatchGenerateResult>;
  generate_audio_for_shot: (shotId: string) => Promise<GenerateResult>;
  generate_audios_batch: (shotIds: string[]) => Promise<BatchGenerateResult>;

  // Utilities
  open_output_dir: () => Promise<ApiResponse>;
  get_app_version: () => Promise<string>;
  get_settings: () => Promise<ApiResponse & { settings?: AppSettings }>;
  save_settings: (settings: AppSettings) => Promise<ApiResponse>;
  select_work_dir: () => Promise<ApiResponse & { path?: string }>;
  select_jianying_draft_dir: () => Promise<ApiResponse & { path?: string }>;
  select_ffmpeg_path: () => Promise<ApiResponse & { path?: string }>;
  export_jianying_draft: () => Promise<ApiResponse & { path?: string }>;
  export_audio_srt: () => Promise<ApiResponse & { srtPath?: string; wavPath?: string }>;
  export_audio_text: () => Promise<ApiResponse & { path?: string }>;
  export_final_video: (withSubtitles?: boolean) => Promise<ApiResponse & { message?: string }>;
  cancel_export_final_video: () => Promise<ApiResponse>;

  // Reference Audio
  scan_reference_audios: (directory: string) => Promise<ApiResponse & { audios?: Array<{ path: string; name: string; relativePath: string }> }>;
  select_reference_audio_dir: () => Promise<ApiResponse & { path?: string }>;
  get_reference_audio_data: (filePath: string) => Promise<ApiResponse & { data?: string; mimeType?: string }>;

  // Preset Audio
  get_preset_audios: () => Promise<ApiResponse & { audios?: PresetAudio[] }>;
  get_preset_audio_data: (relativePath: string) => Promise<ApiResponse & { data?: string; mimeType?: string }>;
  smart_assign_audios: (mode: 'empty_only' | 'all') => Promise<SmartAssignResult>;
  smart_assign_audios_with_llm: (mode: 'empty_only' | 'all') => Promise<SmartAssignResult>;
  select_character_recommendation: (characterId: string, recommendationIndex: number) => Promise<ApiResponse & { character?: Character }>;

  // Audio preferences (global)
  get_audio_preferences: () => Promise<ApiResponse & AudioPreferences>;
  set_audio_speed: (audioPath: string, speed: number) => Promise<ApiResponse>;
  toggle_audio_favorite: (audioPath: string) => Promise<ApiResponse & { isFavorite?: boolean }>;
  record_audio_usage: (audioPath: string) => Promise<ApiResponse>;

  // Shot Builder
  get_shot_builder_prompts: () => Promise<ApiResponse & { prompts?: ShotBuilderPrompts }>;
  save_shot_builder_prompts: (prompts: ShotBuilderPrompts) => Promise<ApiResponse>;
  get_shot_builder_novel: () => Promise<ApiResponse & { text?: string }>;
  save_shot_builder_novel: (text: string) => Promise<ApiResponse>;
  run_shot_builder_step: (step: 'role' | 'scene' | 'shot', force: boolean) => Promise<ShotBuilderRunResult>;
  get_shot_builder_status: () => Promise<ShotBuilderStatus>;
  clear_shot_builder_output: () => Promise<ApiResponse & { outputDir?: string }>;
  get_shot_builder_outputs: () => Promise<ApiResponse & { outputs?: ShotBuilderOutputs }>;
  save_shot_builder_outputs: (outputs: ShotBuilderOutputs) => Promise<ApiResponse & { outputDir?: string }>;

  // Project Settings (作品信息与创作参数)
  get_styles: () => Promise<ApiResponse & { styles?: StylePreset[] }>;
  get_project_settings: () => Promise<ApiResponse & { settings?: ProjectSettings }>;
  save_project_settings: (settings: ProjectSettings) => Promise<ApiResponse>;
  generate_work_info: () => Promise<ApiResponse & { workInfo?: WorkInfo }>;
  chat_update_work_info: (message: string, history: ChatMessage[]) => Promise<ApiResponse & { reply?: string; workInfo?: WorkInfo }>;
  upload_cover_image: () => Promise<ApiResponse & { imageUrl?: string }>;
  generate_cover_image: () => Promise<ApiResponse & { imageUrl?: string }>;
  export_cover_image: () => Promise<ApiResponse & { path?: string }>;
  generate_style_preview: (prompt: string) => Promise<ApiResponse & { imageUrl?: string }>;

  // Update
  check_for_updates: () => Promise<ApiResponse & {
    hasUpdate?: boolean;
    currentVersion?: string;
    latestVersion?: string;
    releaseNotes?: string;
    downloadUrl?: string;
    releaseUrl?: string;
  }>;
  open_download_page: (url: string) => Promise<ApiResponse>;
  reveal_in_file_manager: (filepath: string) => Promise<ApiResponse>;

  // Task Management
  get_task_summary: () => Promise<ApiResponse<TaskSummary>>;
  list_tasks: (taskType?: string, status?: string, offset?: number, limit?: number) => Promise<ApiResponse<Task[]>>;
  get_task: (taskType: string, taskId: string) => Promise<ApiResponse<Task>>;
  poll_tasks: (taskRefs: string[]) => Promise<ApiResponse<Record<string, Task>>>;
  pause_task: (taskType: string, taskId: string) => Promise<ApiResponse>;
  resume_task: (taskType: string, taskId: string) => Promise<ApiResponse>;
  cancel_task: (taskType: string, taskId: string) => Promise<ApiResponse>;
  retry_task: (taskType: string, taskId: string) => Promise<ApiResponse>;
  pause_all_tasks: (taskType?: string) => Promise<ApiResponse & { count?: number }>;
  resume_all_tasks: (taskType?: string) => Promise<ApiResponse & { count?: number }>;
  cancel_all_pending_tasks: (taskType?: string) => Promise<ApiResponse & { count?: number }>;
  create_image_task: (
    subtype: string,
    prompt: string,
    aspectRatio: string,
    provider: string,
    resolution?: string,
    referenceImages?: string,
    outputDir?: string,
    priority?: number,
    dependsOn?: string
  ) => Promise<ApiResponse & { taskId?: string }>;
  create_video_task: (
    subtype: string,
    prompt: string,
    aspectRatio: string,
    provider: string,
    resolution?: string,
    referenceImages?: string,
    duration?: number,
    outputDir?: string,
    priority?: number,
    dependsOn?: string
  ) => Promise<ApiResponse & { taskId?: string }>;
  create_audio_task: (
    text: string,
    provider: string,
    voiceRef?: string,
    emotion?: string,
    emotionIntensity?: string,
    speed?: number,
    outputDir?: string,
    priority?: number,
    dependsOn?: string
  ) => Promise<ApiResponse & { taskId?: string }>;
}

// ========== Style Types ==========

export interface StylePreset {
  id: number;
  name: string;      // 英文名
  name_cn: string;   // 中文名
  image: string;     // 预览图文件名
  desc: string;      // 风格描述
}

// ========== Project Settings Types ==========

export interface WorkInfo {
  title: string;           // 作品名
  coverImage?: string;     // 介绍图路径
  description: string;     // 作品介绍
}

export interface StyleSetting {
  type: 'preset' | 'custom';
  presetId?: number;        // 预设风格 ID
  customPrompt?: string;    // 自定义风格描述
  previewUrl?: string;      // 自定义风格预览图 URL
}

export interface CreationParams {
  style: StyleSetting;
  language: 'zh' | 'en' | 'ja' | 'ko' | string;  // 配音语种
  aspectRatio: '16:9' | '9:16' | '1:1';           // 画面比例
}

export interface ProjectSettings {
  workInfo: WorkInfo;
  creationParams: CreationParams;
}

// ========== AI Chat Types ==========

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ========== Reference Audio Types ==========

// 预置参考音（来自 assets/audios/audios.csv）
export interface PresetAudio {
  name: string;           // 名称，如"岚风"
  path: string;           // 相对路径
  gender: '男' | '女';    // 性别
  ageGroup: string;       // 年龄段：儿童/少年/青年/中年/老年
  age: string;            // 预测年龄，如"28岁"
  speed: string;          // 语速：较慢/适中/较快
  usage: string;          // 用途：旁白/配音/配音+旁白
  tags: string[];         // 标签数组
  typicalRoles: string;   // 典型角色
  description: string;    // 描述
}

// 用户自定义参考音
export interface ReferenceAudio {
  path: string;
  name: string;
  relativePath: string;
}

// 参考音筛选条件
export interface AudioFilter {
  usage: 'narration' | 'voiceover' | 'all';  // 旁白/配音/全部
  gender: '男' | '女' | 'all';
  ageGroup: string | 'all';
  speed: string | 'all';
  searchQuery: string;
}

// 参考音推荐项
export interface AudioRecommendation {
  audioPath: string;      // 预置音路径（不含 preset: 前缀）
  audioName: string;      // 预置音名称
  reason: string;         // 推荐原因
}

// 音频使用记录
export interface AudioUsageRecord {
  path: string;
  lastUsed: string;
  useCount: number;
}

// 音频偏好配置
export interface AudioPreferences {
  speeds: Record<string, number>;
  favorites: string[];
  recentlyUsed: AudioUsageRecord[];
}

// 智能分配结果（大模型版本）
export interface SmartAssignResult {
  success: boolean;
  assignedCount: number;
  skippedCount: number;
  error?: string;
  recommendations?: Record<string, AudioRecommendation[]>;  // characterId -> 推荐列表
}

// ========== Settings Types ==========

export interface AppSettings {
  workDir: string;
  jianyingDraftDir: string;
  referenceAudioDir: string;  // 参考音频目录
  ffmpegPath: string;  // ffmpeg 可执行文件路径
  tts: {
    apiUrl: string;
    model: string;
    apiKey: string;
    concurrency: number;
  };
  tti: {
    provider: 'openai' | 'whisk';  // 接口类型
    // OpenAI 模式配置
    apiUrl: string;
    apiKey: string;
    characterModel: string;
    sceneModel: string;
    shotModel: string;
    // Whisk 模式配置
    whiskToken: string;
    whiskWorkflowId: string;
    whiskCookie: string;
    concurrency: number;
  };
  ttv: {
    provider: 'openai' | 'whisk';  // 接口类型
    // OpenAI 模式配置
    apiUrl: string;
    apiKey: string;
    model: string;
    // Whisk 模式配置
    whiskToken: string;
    whiskWorkflowId: string;
    concurrency: number;
  };
  shotBuilder: {
    apiUrl: string;
    apiKey: string;
    model: string;
  };
}

// ========== Window Extension ==========

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewApi;
    };
  }
}

// ========== App State Types ==========

export interface AppState {
  project: ProjectData | null;
  projectPath: string | null;
  isDirty: boolean;
  selectedShotIds: string[];
  isGenerating: boolean;
  generationProgress: {
    current: number;
    total: number;
    type: 'image' | 'video';
  } | null;
}

// ========== Component Props Types ==========

export interface CharacterPanelProps {
  characters: Character[];
  onAddCharacter: (name: string, description: string) => void;
  onUpdateCharacter: (id: string, name: string, description: string) => void;
  onDeleteCharacter: (id: string) => void;
  onUploadImage: (id: string) => void;
}

export interface ShotTableProps {
  shots: Shot[];
  selectedIds: string[];
  onSelectShot: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteShots: (ids: string[]) => void;
  onGenerateImages: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onSelectImage: (shotId: string, imageIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string) => void;
}

export interface ShotRowProps {
  shot: Shot;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onGenerateImages: () => void;
  onGenerateVideo: () => void;
  onGenerateAudio: () => void;
  onSelectImage: (imageIndex: number) => void;
  onDelete: () => void;
}
