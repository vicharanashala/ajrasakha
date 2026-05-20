"""Unit tests for reviewer question_id extraction (no live API)."""

from reviewer_question import (
    extract_question_id_from_messages,
    resolve_client_ids,
)


def test_resolve_client_ids_from_headers():
    user_id, message_id = resolve_client_ids(
        {"x-user-id": "664c91fa2f8b4c17b92e1201", "x-message-id": "msg_20260519_001"},
        {},
    )
    assert user_id == "664c91fa2f8b4c17b92e1201"
    assert message_id == "msg_20260519_001"


def test_resolve_client_ids_body_fallback():
    user_id, message_id = resolve_client_ids(
        {},
        {"userId": "user-body", "messageId": "msg-body"},
    )
    assert user_id == "user-body"
    assert message_id == "msg-body"


def test_extract_from_current_turn_only():
    messages = [
        {"type": "human", "content": "first"},
        {
            "type": "tool",
            "name": "upload_question_to_reviewer_system",
            "content": '{"question_id": "old-id"}',
        },
        {"type": "ai", "content": "reply"},
        {"type": "human", "content": "follow up"},
        {"type": "ai", "content": "no upload"},
    ]
    assert extract_question_id_from_messages(messages) is None


def test_extract_from_upload_tool_artifact():
    messages = [
        {"type": "human", "content": "question"},
        {
            "type": "tool",
            "name": "upload_question_to_reviewer_system",
            "artifact": {
                "structured_content": {
                    "result": {"data": {"question_id": "q-new-123"}},
                }
            },
        },
    ]
    assert extract_question_id_from_messages(messages) == "q-new-123"


def test_extract_top_level_question_id_in_result():
    messages = [
        {"type": "human", "content": "question"},
        {
            "type": "tool",
            "name": "upload_question_to_reviewer_system",
            "artifact": {
                "structured_content": {
                    "result": {"question_id": "q-mcp-top"},
                }
            },
        },
    ]
    assert extract_question_id_from_messages(messages) == "q-mcp-top"
