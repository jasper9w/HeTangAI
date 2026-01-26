from openai import OpenAI
import os

# 加载 .env 文件中的环境变量

def call_llm_stream(
    data: str | list = None,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    use_env: bool = True,
):
    """
    调用大模型并按行流式返回内容

    Args:
        data: 输入数据，支持以下格式：
            - str: 简单字符串提示词（作为用户消息）
            - [("role", "content"), ...] 元组列表
            - [{"role": "xxx", "content": "xxx"}, ...] 字典列表
        model: 模型名称，默认从环境变量读取

    Yields:
        str: 按行返回的内容
    """
    if use_env:
        api_key = api_key or os.getenv("OPENAI_API_KEY")
        base_url = base_url or os.getenv("OPENAI_BASE_URL")
        model = model or os.getenv("OPENAI_MODEL", "gemini-3-pro-preview")

    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url

    client = OpenAI(**client_kwargs)

    if data is None:
        raise ValueError("必须提供 data 参数")

    # 根据类型组装消息列表
    if isinstance(data, str):
        # 字符串格式：作为用户消息
        formatted_messages = [{"role": "user", "content": data}]
    elif isinstance(data, list):
        formatted_messages = []
        for msg in data:
            if isinstance(msg, tuple):
                # 元组格式: ("role", "content")
                formatted_messages.append({"role": msg[0], "content": msg[1]})
            elif isinstance(msg, dict):
                # 字典格式：直接使用
                formatted_messages.append(msg)
            else:
                raise ValueError(f"不支持的消息格式: {type(msg)}")
    else:
        raise ValueError(f"不支持的输入类型: {type(data)}")

    stream = client.chat.completions.create(
        model=model,
        messages=formatted_messages,
        stream=True
    )

    buffer = ""

    for chunk in stream:
        if chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            buffer += content

            # 按行分割并返回完整的行
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                yield line

    # 返回缓冲区中剩余的内容（最后一行可能没有换行符）
    if buffer:
        yield buffer

# 使用示例
if __name__ == "__main__":
    # 方式1：简单模式，只传入 prompt
    print("方式1：简单模式")
    print("-" * 50)
    for line in call_llm_stream("你好，请简单介绍一下自己"):
        print(line)

    print("\n")

    # 方式2：使用元组列表传入 messages
    print("方式2：元组列表格式")
    print("-" * 50)
    messages_tuple = [
        ("system", "你是一个专业的Python程序员"),
        ("user", "什么是列表推导式？请简短回答")
    ]
    for line in call_llm_stream(messages_tuple):
        print(line)

    print("\n")

    # 方式3：使用字典列表传入 messages
    print("方式3：字典列表格式")
    print("-" * 50)
    messages_dict = [
        {"role": "system", "content": "你是一个友好的助手"},
        {"role": "user", "content": "1+1等于几？"}
    ]
    for line in call_llm_stream(messages_dict):
        print(line)