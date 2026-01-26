/**
 * Type definitions for AI Lens Creation Workshop
 */

// ========== Page Types ==========

export type PageType = 'projects' | 'home' | 'storyboard' | 'shots' | 'characters' | 'dubbing' | 'settings';

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
  speed: number;        // 配音倍速，默认1.0
  isNarrator: boolean;  // 是否为旁白角色
  status: CharacterStatus;
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
  characters: Character[];
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
  results: Array<{
    shot_id: string;
    success: boolean;
    error?: string;
  }>;
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

  // Shot management
  update_shot: (shotId: string, field: string, value: unknown) => Promise<ApiResponse & { shot?: Shot }>;
  delete_shots: (shotIds: string[]) => Promise<ApiResponse & { deletedCount?: number }>;
  select_image: (shotId: string, imageIndex: number) => Promise<ApiResponse>;
  select_video: (shotId: string, videoIndex: number) => Promise<ApiResponse>;
  insert_shot: (afterShotId: string | null) => Promise<ApiResponse & { shots?: Shot[] }>;

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
  export_jianying_draft: () => Promise<ApiResponse & { path?: string }>;

  // Reference Audio
  scan_reference_audios: (directory: string) => Promise<ApiResponse & { audios?: Array<{ path: string; name: string; relativePath: string }> }>;
  select_reference_audio_dir: () => Promise<ApiResponse & { path?: string }>;
  get_reference_audio_data: (filePath: string) => Promise<ApiResponse & { data?: string; mimeType?: string }>;

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
}

// ========== Settings Types ==========

export interface AppSettings {
  workDir: string;
  jianyingDraftDir: string;
  referenceAudioDir: string;  // 参考音频目录
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
