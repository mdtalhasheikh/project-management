from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

import httpx

DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class AIConfigurationError(RuntimeError):
    """Raised when required AI configuration is missing."""


@dataclass(frozen=True)
class AISettings:
    api_key: str
    model: str
    base_url: str


type ChatMessage = dict[Literal["role", "content"], str]


def get_ai_settings() -> AISettings:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise AIConfigurationError("OPENROUTER_API_KEY is not set")

    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL).strip()
    base_url = os.environ.get("OPENROUTER_BASE_URL", DEFAULT_OPENROUTER_BASE_URL).strip()
    return AISettings(
        api_key=api_key,
        model=model or DEFAULT_OPENROUTER_MODEL,
        base_url=(base_url or DEFAULT_OPENROUTER_BASE_URL).rstrip("/"),
    )


class OpenRouterClient:
    def __init__(
        self,
        settings: AISettings | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.settings = settings or get_ai_settings()
        self.http_client = http_client

    def ask(self, question: str) -> str:
        return self.chat([{"role": "user", "content": question}])

    def chat(self, messages: list[ChatMessage], response_format: dict[str, str] | None = None) -> str:
        payload = {
            "model": self.settings.model,
            "messages": messages,
            "temperature": 0,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        if self.http_client is not None:
            return self._post_completion(self.http_client, payload)

        with httpx.Client(timeout=30) as http_client:
            return self._post_completion(http_client, payload)

    def _post_completion(self, http_client: httpx.Client, payload: dict[str, Any]) -> str:
        response = http_client.post(
            f"{self.settings.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

        data = response.json()
        try:
            answer = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("OpenRouter response did not include a message") from error

        if not isinstance(answer, str) or not answer.strip():
            raise RuntimeError("OpenRouter response did not include a message")
        return answer.strip()
