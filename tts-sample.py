import requests
import base64
import soundfile as sf
import numpy as np


def tts_request(
        server_url: str,
        text: str,
        spk_audio_file: str,
        emo_control_method: int = 0,
        emo_ref_file: str = None,
        emo_weight: float = 1.0,
        emo_vec: list = None,
        emo_text: str = None,
        emo_random: bool = False,
        output_file: str = "output.wav"
):
    """
    调用 TTS API

    参数:
        server_url: 服务器地址，如 "http://localhost:8000/tts_url"
        text: 要合成的文本
        spk_audio_file: 本地说话人参考音频文件路径
        emo_control_method: 情感控制方式
            0 - 无情感控制
            1 - 使用参考音频控制情感
            2 - 使用情感向量控制
            3 - 使用文本描述控制情感
        emo_ref_file: 情感参考音频文件路径（emo_control_method=1 时使用）
        emo_weight: 情感权重，默认 1.0
        emo_vec: 情感向量，8维列表（emo_control_method=2 时使用）
                 例如 [0.5, 0.2, 0, 0, 0, 0, 0, 0]，总和不超过 1.5
        emo_text: 情感文本描述（emo_control_method=3 时使用）
        emo_random: 是否随机情感
        output_file: 输出音频文件路径
    """

    # 读取并编码说话人参考音频
    with open(spk_audio_file, "rb") as f:
        spk_audio_base64 = base64.b64encode(f.read()).decode("utf-8")

    # 构建请求数据
    payload = {
        "text": text,
        "spk_audio_base64": spk_audio_base64,
        "emo_control_method": emo_control_method,
        "emo_weight": emo_weight,
        "emo_random": emo_random
    }

    # 如果有情感参考音频
    if emo_ref_file and emo_control_method == 1:
        with open(emo_ref_file, "rb") as f:
            payload["emo_ref_base64"] = base64.b64encode(f.read()).decode("utf-8")

    # 如果使用情感向量
    if emo_vec and emo_control_method == 2:
        payload["emo_vec"] = emo_vec

    # 如果使用情感文本
    if emo_text and emo_control_method == 3:
        payload["emo_text"] = emo_text

    # 发送请求
    response = requests.post(server_url, json=payload)

    if response.status_code == 200:
        with open(output_file, "wb") as f:
            f.write(response.content)
        print(f"音频已保存到: {output_file}")
        return True
    else:
        print(f"请求失败: {response.json()}")
        return False


# ========== 使用示例 ==========
# SERVER_URL = "http://h9m3nqdj5c7u6zaz-6006.container.x-gpu.com/tts_url"
SERVER_URL = "http://pj6fw2veia01q1hx-6006.container.x-gpu.com/tts_url"

# 示例1: 基础调用（无情感控制）
# tts_request(
#     server_url=SERVER_URL,
#     text="你好，很高兴认识你！",
#     spk_audio_file="./reference_speaker.wav",
#     emo_control_method=0,
#     output_file="output_basic.wav"
# )

# # 示例2: 使用情感参考音频
# tts_request(
#     server_url=SERVER_URL,
#     text="今天真是太开心了！",
#     spk_audio_file="./reference_speaker.wav",
#     emo_control_method=1,
#     emo_ref_file="./happy_emotion.wav",
#     emo_weight=0.8,
#     output_file="output_emo_ref.wav"
# )

# 示例3: 使用情感向量
# 假设8维向量分别代表: [开心, 悲伤, 愤怒, 惊讶, 恐惧, 厌恶, 平静, 其他]
# 情感轻度：中等=0，较强=0.3，强烈=0.5
# tts_request(
#     server_url=SERVER_URL,
#     text="床头的手机微光闪烁，日期赫然显示",
#     spk_audio_file="./reference_speaker.wav",
#     emo_control_method=2,
#     emo_vec=[0.0, 0, 0, 0.0, 0, 0, 0.0, 0],  # 开心 + 惊讶，总和不超过1.5
#     output_file="output_emo_vec.wav"
# )

# 示例4: 使用情感文本描述
# tts_request(
#     server_url=SERVER_URL,
#     text="""床头的手机微光闪烁，日期赫然显示
# 她回到了三年前，顾宴回向她求婚的一个月前
# 也是他的白月光宋晚棠，即将被那人渣养父卖给老男人抵债的前夕""",
#     spk_audio_file="./reference_speaker.wav",
#     emo_control_method=3,
#     emo_text="强烈生气",
#     output_file="output_emo_text.wav"
# )

# 读取excel
import pandas as pd

role_df = pd.read_csv('/Users/wei/Desktop/playground/26Q1/2601C/audio_async/voice_analysis.csv')
print(role_df)
ref_root_path = '/Users/wei/Downloads/800+音色'
role2path = {}
for index, row in role_df.iterrows():
    role_name = row['名称']
    role_path = f"{ref_root_path}/{row['相对路径']}"
    role2path[role_name] = role_path


character_voice_mapping = {
    "旁白": "/Users/wei/Downloads/800+音色/01_解说专用-高质量/女频情感.MP3",
    # "孟归渡": "/Users/wei/Downloads/800+音色/情绪/男-恃才傲物、高傲.wav",
    # "萧云昭": "/Users/wei/Downloads/800+音色/智声整理音色/热门音色/活泼小姐.wav",
    # "小桃": "/Users/wei/Downloads/800+音色/智声整理音色/孩童/女-古板认真.wav",
    # "李公公": "/Users/wei/Downloads/800+音色/智声整理音色/中年-男声/太监公公.wav",
    "沈晚晚": "/Users/wei/Downloads/800+音色/智声整理音色/热门音色/云甜甜.wav",
    "司徒嫣": "/Users/wei/Downloads/800+音色/智声整理音色/热门音色/温柔贤淑小姐.wav",

    "柳如烟": "/Users/wei/Downloads/800+音色/智声整理音色/热门音色/活泼小姐.wav",
    "萧承瑾": "/Users/wei/Downloads/800+音色/克隆参考音色/400个火爆音色/帝王_皇帝.mp3",
    "林盛": "/Users/wei/Downloads/800+音色/智声整理音色/中年-男声/太监公公.wav",
}
import pandas as pd
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

df = pd.read_excel("输出目录/result.xlsx")


# 定义处理单个任务的函数
def process_task(index, row):
    task_id = row['序号']
    task_role = row['配音角色']
    task_text = row['文案']
    task_emo_type = row['情感']
    task_emo_level = row['强度']
    output_file = f"audio_segments/{task_id}.wav"

    # 判断文件是否存在，存在则跳过
    file_path = Path(output_file)
    if file_path.exists() and task_role != "司徒嫣":
        print(f"已经存在: {file_path}，跳过")
        return


    # 确保输出目录的文件夹存在
    output_base_dir = os.path.dirname(output_file)
    os.makedirs(output_base_dir, exist_ok=True)

    ref_path = character_voice_mapping[task_role] if task_role in character_voice_mapping else None
    # ref_path = role2path[ref_role]


    print(task_id, task_role, ref_path)

    tts_request(
        server_url=SERVER_URL,
        text=task_text,
        spk_audio_file=ref_path,
        emo_control_method=0,
        # emo_control_method=3,
        # emo_text=f"{task_emo_level}的{task_emo_type}",
        # emo_text=f"{task_emo_type}",
        output_file=output_file
    )

    print(f"#{task_id}, {output_file}")


# 设置并发数（默认为3）
max_workers = 30

# 使用线程池执行并发任务
with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = {executor.submit(process_task, index, row): index for index, row in df.iterrows()}

    for future in as_completed(futures):
        try:
            future.result()
        except Exception as e:
            print(f"任务执行失败: {e}")


# 生成完整的wav和srt文件
def seconds_to_srt_time(seconds):
    """将秒数转换为SRT时间格式 (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


print("\n开始合并音频和生成字幕...")

# 收集所有音频文件信息
audio_segments = []
current_time = 0
sample_rate = None

for index, row in df.iterrows():
    task_id = row['序号']
    output_file = f"audio_segments/{task_id}.wav"
    task_text = row['文案']

    file_path = Path(output_file)
    if not file_path.exists():
        print(f"警告: {output_file} 不存在，跳过")
        continue

    audio, sr = sf.read(output_file)

    # 确保所有音频的采样率相同
    if sample_rate is None:
        sample_rate = sr
    elif sample_rate != sr:
        print(f"警告: {output_file} 采样率 {sr} 与预期 {sample_rate} 不符")

    duration = len(audio) / sr  # 转换为秒

    audio_segments.append({
        'audio': audio,
        'text': task_text,
        'start_time': current_time,
        'end_time': current_time + duration
    })
    current_time += duration

# 写入SRT字幕文件
srt_file = "output.srt"
with open(srt_file, 'w', encoding='utf-8') as srt:
    for idx, segment in enumerate(audio_segments, 1):
        start_time = seconds_to_srt_time(segment['start_time'])
        end_time = seconds_to_srt_time(segment['end_time'])
        srt.write(f"{idx}\n")
        srt.write(f"{start_time} --> {end_time}\n")
        srt.write(f"{segment['text']}\n\n")

print(f"字幕文件已生成: {srt_file}")

# 合并所有音频文件
output_wav = "output.wav"
combined_audio = np.concatenate([segment['audio'] for segment in audio_segments])

sf.write(output_wav, combined_audio, sample_rate)

print(f"音频文件已生成: {output_wav}")
print(f"总时长: {seconds_to_srt_time(current_time)}")