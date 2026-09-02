"""LLM Provider 抽象基类"""

from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    """LLM Provider 抽象基类，支持多后端切换"""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        """生成文本"""
        ...


def get_llm_provider() -> BaseLLMProvider:
    """Provider 工厂：根据配置返回对应的 LLM Provider"""
    from app.config import settings

    if settings.llm_provider == "vllm" and settings.vllm_endpoint:
        from app.llm.vllm import VLLMProvider

        return VLLMProvider()
    from app.llm.tongyi import TongyiProvider

    return TongyiProvider()