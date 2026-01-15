/**
 * Type definitions for AI Lens Creation Workshop
 */

// ========== Shot Types ==========

export type ShotStatus =
  | 'pending'
  | 'generating_images'
  | 'images_ready'
  | 'generating_video'
  | 'generating_audio'
  | 'completed'
  | 'error';

export interface Shot {
  id: string;
  sequence: number;
  voiceActor: string;
  characters: string[];
  emotion: string;
  intensity: string;
  script: string;
  imagePrompt: string;
  videoPrompt: string;
  images: string[];
  selectedImageIndex: number;
  videoUrl: string;
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
  status: CharacterStatus;
  errorMessage?: string;
}

// ========== Project Types ==========

export interface ProjectData {
  version: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  characters: Character[];
  shots: Shot[];
}

// ========== API Response Types ==========

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
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
  get_project_data: () => Promise<ApiResponse<ProjectData> & { path?: string | null }>;
  update_project_name: (name: string) => Promise<ApiResponse>;

  // Import/Export
  import_excel: () => Promise<ImportResult>;
  export_template: () => Promise<ApiResponse & { path?: string }>;

  // Character management
  add_character: (name: string, description?: string) => Promise<ApiResponse & { character?: Character }>;
  update_character: (characterId: string, name: string, description: string) => Promise<ApiResponse & { character?: Character }>;
  delete_character: (characterId: string) => Promise<ApiResponse>;
  generate_character_image: (characterId: string) => Promise<ApiResponse & { imageUrl?: string; character?: Character }>;
  generate_characters_batch: (characterIds: string[]) => Promise<BatchGenerateResult>;

  // Shot management
  update_shot: (shotId: string, field: string, value: unknown) => Promise<ApiResponse & { shot?: Shot }>;
  delete_shots: (shotIds: string[]) => Promise<ApiResponse & { deletedCount?: number }>;
  select_image: (shotId: string, imageIndex: number) => Promise<ApiResponse>;

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
