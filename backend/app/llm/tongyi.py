"""通义千问 LLM Provider"""

from openai import AsyncOpenAI

from app.config import settings
from app.llm.base import BaseLLMProvider


class TongyiProvider(BaseLLMProvider):
    """调用通义千问 API"""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.tongyi_api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        response = await self.client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""