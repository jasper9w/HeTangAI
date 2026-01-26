import json
import argparse
import shutil
import os
from pathlib import Path
from typing import List, Type, TypeVar, Set, Dict, Any

from pydantic import BaseModel, Field, ValidationError
from loguru import logger

# ================= 0. 工具库导入 =================
# 请确保这些文件在同级目录下
try:
    from services.stream_llm import call_llm_stream
    from services.utils import read_text
except ImportError:
    import sys
    current_dir = Path(__file__).resolve().parent
    if str(current_dir) not in sys.path:
        sys.path.append(str(current_dir))
    from stream_llm import call_llm_stream
    from utils import read_text


# ================= 1. Pydantic 模型定义 =================
class TTI_Role(BaseModel):
    prompt: str = ""
    attire: str = ""
    physique: str = ""
    expression: str = ""
    style: str = ""


class Role(BaseModel):
    id: int
    name: str
    alias: List[str] = []
    alias_rel: str = ""
    gender: str
    age: int
    dna: str
    tti: TTI_Role


class TTI_Scene(BaseModel):
    environment: str = ""
    architecture: str = ""
    props: str = ""
    lighting: str = ""
    atmosphere: str = ""
    style: str = ""


class Scene(BaseModel):
    id: int
    name: str
    desc: str
    tti: TTI_Scene


class Dialogue(BaseModel):
    r: str
    t: str


class TTI_Shot(BaseModel):
    characters: List[str] = []
    shot_type: str = ""
    angle: str = ""
    composition: str = ""
    lighting: str = ""
    mood: str = ""


class TTV_Shot(BaseModel):
    motion_type: str = ""
    motion_desc: str = ""
    duration: str = ""
    speed: str = ""


class Shot(BaseModel):
    shot: int
    scene: str
    tti: TTI_Shot
    ttv: TTV_Shot
    dialogue: List[Dialogue] = []


T = TypeVar("T", bound=BaseModel)


# ================= 2. 辅助函数 =================

def load_existing_data(file_path: Path, model_cls: Type[T]) -> List[T]:
    """读取已存在的 JSONL 文件"""
    data = []
    if not file_path.exists():
        return data

    logger.info(f"发现已存在文件 {file_path}，正在读取")
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                obj = model_cls.model_validate_json(line)
                data.append(obj)
            except ValidationError:
                continue
    logger.info(f"成功加载 {len(data)} 条数据，跳过生成")
    return data


def split_text(text: str, lines_per_chunk=50) -> List[str]:
    lines = text.split('\n')
    lines = [l for l in lines if l.strip()]  # 去除纯空行
    return ["\n".join(lines[i:i + lines_per_chunk]) for i in range(0, len(lines), lines_per_chunk)]


# ================= 3. 核心执行逻辑 =================

def _resolve_llm_config(llm_config: Dict[str, Any] | None) -> Dict[str, str | None]:
    if not llm_config:
        return {"model": None, "api_key": None, "base_url": None, "use_env": True}
    return {
        "model": llm_config.get("model"),
        "api_key": llm_config.get("api_key"),
        "base_url": llm_config.get("base_url"),
        "use_env": False,
    }


def run_step(
        messages: list,
        model_cls: Type[T],
        save_path: Path,
        llm_config: Dict[str, Any] | None = None
) -> List[T]:
    """
    通用生成步骤 (Role/Scene)
    """
    logger.info(f"开始生成: {save_path.name}")
    save_path.parent.mkdir(parents=True, exist_ok=True)
    collected_objects = []
    full_response_text = []

    # 追加模式，确保不断流
    with open(save_path, "a", encoding="utf-8") as f:
        cfg = _resolve_llm_config(llm_config)
        for line in call_llm_stream(
            messages,
            model=cfg["model"],
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            use_env=cfg["use_env"],
        ):
            line = line.strip()
            if not line: continue

            full_response_text.append(line)

            if line.startswith("{"):
                try:
                    obj = model_cls.model_validate_json(line)
                    # 立即落盘并刷新缓冲区
                    f.write(obj.model_dump_json(ensure_ascii=False) + "\n")
                    f.flush()
                    collected_objects.append(obj)
                    logger.info(f"已保存: {line[:40]}...")
                except ValidationError:
                    pass

    # 更新历史
    messages.append({"role": "assistant", "content": "\n".join(full_response_text)})
    return collected_objects


def run_shot_step_with_validation(
        messages: list,
        save_path: Path,
        valid_roles: Set[str],
        valid_scenes: Set[str],
        max_retries: int = 3,
        llm_config: Dict[str, Any] | None = None
) -> List[Shot]:
    """
    带校验的分镜生成步骤
    """
    save_path.parent.mkdir(parents=True, exist_ok=True)
    current_retries = 0

    while current_retries <= max_retries:
        logger.info(f"分镜生成尝试 {current_retries + 1}/{max_retries + 1}")

        collected_objects = []
        partial_response_text = []
        error_found = False
        error_msg = ""

        with open(save_path, "a", encoding="utf-8") as f:
            cfg = _resolve_llm_config(llm_config)
            stream = call_llm_stream(
                messages,
                model=cfg["model"],
                api_key=cfg["api_key"],
                base_url=cfg["base_url"],
                use_env=cfg["use_env"],
            )
            for line in stream:
                line = line.strip()
                if not line: continue

                partial_response_text.append(line)

                if line.startswith("{"):
                    try:
                        shot_obj = Shot.model_validate_json(line)

                        # --- 逻辑校验 ---
                        if shot_obj.scene not in valid_scenes:
                            error_found = True
                            error_msg = f"场景 '{shot_obj.scene}' 不在清单中。可用: {list(valid_scenes)}"

                        for char_name in shot_obj.tti.characters:
                            if char_name not in valid_roles:
                                error_found = True
                                error_msg = f"角色 '{char_name}' 不在清单中。可用: {list(valid_roles)}"
                                break

                        if error_found:
                            logger.warning(f"校验失败中断: {error_msg}")
                            break  # 停止接收流
                        else:
                            f.write(shot_obj.model_dump_json(ensure_ascii=False) + "\n")
                            f.flush()  # 强制落盘
                            collected_objects.append(shot_obj)
                            logger.info(f"镜头 {shot_obj.shot} 通过")

                    except ValidationError:
                        pass

        # 记录本次生成的内容到上下文
        full_text = "\n".join(partial_response_text)
        messages.append({"role": "assistant", "content": full_text})

        if error_found:
            logger.warning("触发自动修正")
            messages.append({
                "role": "user",
                "content": f"【系统错误】{error_msg}。请停止生成，并从出错的镜头开始，重新输出正确的JSONL。"
            })
            current_retries += 1
        else:
            return collected_objects

    logger.error("超过最大重试次数，跳过本段")
    return collected_objects


# ================= 4. 状态管理 (断点续传核心) =================

STATE_FILE = "session_state.json"


def save_state(output_dir: Path, current_chunk_idx: int, messages: list):
    """保存当前的进度索引和 LLM 上下文，以便完美恢复记忆"""
    state_path = output_dir / STATE_FILE
    state_data = {
        "last_chunk_idx": current_chunk_idx,
        "messages": messages  # 保存完整的对话历史
    }
    # 使用临时文件写入，防止写入中断导致文件损坏
    temp_path = state_path.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(state_data, f, ensure_ascii=False, indent=2)
    temp_path.replace(state_path)
    logger.info(f"进度已保存: Chunk {current_chunk_idx}")


def load_state(output_dir: Path) -> tuple[int, list]:
    """加载进度"""
    state_path = output_dir / STATE_FILE
    if state_path.exists():
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"恢复断点: 将从 Chunk {data['last_chunk_idx'] + 1} 继续")
            return data["last_chunk_idx"], data["messages"]
        except Exception as e:
            logger.warning(f"状态文件损坏，从头开始: {e}")
    return -1, []


def generate_roles(
        prompt_role: str,
        novel_text: str,
        output_dir: Path,
        llm_config: Dict[str, Any] | None = None
) -> List[Role]:
    """生成角色清单"""
    roles_path = output_dir / "roles.jsonl"
    if roles_path.exists():
        return load_existing_data(roles_path, Role)

    msgs_role = [
        {"role": "system", "content": prompt_role},
        {"role": "user", "content": novel_text}
    ]
    return run_step(msgs_role, Role, roles_path, llm_config=llm_config)


def generate_scenes(
        prompt_scene: str,
        novel_text: str,
        output_dir: Path,
        llm_config: Dict[str, Any] | None = None
) -> List[Scene]:
    """生成场景清单"""
    scenes_path = output_dir / "scenes.jsonl"
    if scenes_path.exists():
        return load_existing_data(scenes_path, Scene)

    msgs_scene = [
        {"role": "system", "content": prompt_scene},
        {"role": "user", "content": novel_text}
    ]
    return run_step(msgs_scene, Scene, scenes_path, llm_config=llm_config)


def generate_shots(
        prompt_shot_sys: str,
        novel_text: str,
        roles: List[Role],
        scenes: List[Scene],
        output_dir: Path,
        llm_config: Dict[str, Any] | None = None
) -> None:
    """生成分镜清单"""
    if not roles or not scenes:
        logger.error("角色或场景为空，无法生成分镜")
        return

    valid_role_names = {r.name for r in roles} | {a for r in roles for a in r.alias}
    valid_scene_names = {s.name for s in scenes}
    logger.info(f"Valid roles: {len(valid_role_names)}")
    logger.info(f"Valid scenes: {len(valid_scene_names)}")

    roles_db = "\n".join([r.model_dump_json(ensure_ascii=False) for r in roles])
    scenes_db = "\n".join([s.model_dump_json(ensure_ascii=False) for s in scenes])

    chunks = split_text(novel_text, lines_per_chunk=80)
    last_processed_idx, saved_messages = load_state(output_dir)

    if saved_messages:
        msgs_shot = saved_messages
    else:
        msgs_shot = [
            {"role": "system", "content": prompt_shot_sys},
            {"role": "assistant", "content": "已准备好，请发送资料。"}
        ]

    shots_path = output_dir / "shots.jsonl"
    logger.info(f"开始分镜生成，总计 {len(chunks)} 段文本")

    for i, chunk in enumerate(chunks):
        if i <= last_processed_idx:
            logger.info(f"跳过已完成块 {i}")
            continue

        if i == 0:
            user_input = (
                f"【角色清单】\n{roles_db}\n\n"
                f"【场景清单】\n{scenes_db}\n\n"
                f"【第一段小说原文】\n{chunk}"
            )
        else:
            user_input = f"【下一段小说原文】\n{chunk}"

        msgs_shot.append({"role": "user", "content": user_input})

        run_shot_step_with_validation(
            messages=msgs_shot,
            save_path=shots_path,
            valid_roles=valid_role_names,
            valid_scenes=valid_scene_names,
            max_retries=3,
            llm_config=llm_config
        )

        save_state(output_dir, i, msgs_shot)


# ================= 5. 主流程 =================

def main():
    # --- 命令行参数 ---
    parser = argparse.ArgumentParser(description="Novel to Script Converter")
    parser.add_argument("-f", "--force", action="store_true", help="强制覆盖，清除旧数据")
    args = parser.parse_args()

    # --- 路径配置 ---
    novel_path = Path("novel.txt")
    output_dir = Path("output")

    # --- 强制模式处理 ---
    if args.force:
        logger.info("检测到 -f 参数，清除旧数据")
        if output_dir.exists():
            shutil.rmtree(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        output_dir.mkdir(parents=True, exist_ok=True)

    # --- 读取 Prompt ---
    # 假设文件都存在
    prompt_role = read_text("prompts/role.txt")
    prompt_scene = read_text("prompts/scene.txt")
    prompt_shot_sys = read_text("prompts/shot.txt")
    novel_content = read_text(str(novel_path))

    roles = generate_roles(prompt_role, novel_content, output_dir)
    scenes = generate_scenes(prompt_scene, novel_content, output_dir)
    generate_shots(prompt_shot_sys, novel_content, roles, scenes, output_dir)

    logger.info("全部生成完成")


if __name__ == "__main__":
    main()