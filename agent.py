import requests
import json

# 替换为你的实际参数
PAT_TOKEN = "sat_eEqpbHhRGO1Ulgye8hupCLOQvGzzviTY9rRtlvbtMbbjnMU4mSYZAkqBSVDrXVgx"  # 例如："pat_xxxxxxxxxxxxxx"
BOT_ID = "7560889707228495935"    # 例如："7560889707228495935"
USER_ID = "7558012905426288678"  # 例如："user_001"
QUESTION = "推荐一本机器学习入门书"       # 例如："推荐一本机器学习入门书"

# 请求URL
url = "https://api.coze.cn/v3/chat"

# 请求头
headers = {
    "Authorization": f"Bearer {PAT_TOKEN}",
    "Content-Type": "application/json"
}

# 请求体
data = {
    "bot_id": BOT_ID,
    "user_id": USER_ID,
    "stream": False,
    "additional_messages": [
        {
            "role": "user",
            "content": QUESTION,
            "content_type": "text"
        }
    ]
}

try:
    # 发送POST请求
    response = requests.post(url, headers=headers, data=json.dumps(data))
    response.raise_for_status()  # 检查请求是否成功（非200状态码会抛异常）
    
    # 解析响应结果
    result = response.json()
    print("智能体回复：", json.dumps(result, ensure_ascii=False, indent=2))

except requests.exceptions.RequestException as e:
    print("请求失败：", str(e))
except json.JSONDecodeError:
    print("响应解析失败，原始响应：", response.text)
