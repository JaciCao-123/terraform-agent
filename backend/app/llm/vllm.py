"""本地 VLLM LLM Provider (兼容 OpenAI API 格式)"""

from openai import AsyncOpenAI

from app.config import settings
from app.llm.base import BaseLLMProvider


class VLLMProvider(BaseLLMProvider):
    """调用本地 VLLM 服务"""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key="not-needed",
            base_url=settings.vllm_endpoint,
        )
        self.model_name = settings.vllm_model_name or "default"

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""