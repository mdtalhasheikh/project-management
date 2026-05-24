import json

import httpx
import pytest

from project_management import ai


def test_ai_settings_require_api_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(ai.AIConfigurationError, match="OPENROUTER_API_KEY is not set"):
        ai.get_ai_settings()


def test_ai_settings_use_configurable_model(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "custom/model")

    settings = ai.get_ai_settings()

    assert settings.model == "custom/model"


def test_openrouter_client_sends_configured_model() -> None:
    captured_request: httpx.Request | None = None
    captured_payload: dict[str, object] | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_payload, captured_request
        captured_request = request
        captured_payload = json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "4"}}]},
        )

    settings = ai.AISettings(
        api_key="test-key",
        model="custom/model",
        base_url="https://openrouter.test/api/v1",
    )
    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        answer = ai.OpenRouterClient(settings, http_client).ask("What is 2+2?")

    assert answer == "4"
    assert captured_request is not None
    assert captured_request.url == "https://openrouter.test/api/v1/chat/completions"
    assert captured_request.headers["authorization"] == "Bearer test-key"
    assert captured_payload is not None
    assert captured_payload["model"] == "custom/model"


def test_openrouter_client_rejects_missing_message() -> None:
    settings = ai.AISettings(
        api_key="test-key",
        model="custom/model",
        base_url="https://openrouter.test/api/v1",
    )
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"choices": []}))
    ) as http_client:
        client = ai.OpenRouterClient(settings, http_client)

        with pytest.raises(RuntimeError, match="OpenRouter response did not include a message"):
            client.ask("What is 2+2?")
