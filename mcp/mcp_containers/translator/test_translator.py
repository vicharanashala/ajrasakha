"""
Test script for the Translation MCP Server

This script tests the translation functionality with the local vLLM server.
"""

import asyncio
import sys
import os

# Add parent directory to path to import translator
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from translator import translate_text, batch_translate


async def test_single_translation():
    """Test single text translation"""
    print("=" * 60)
    print("Testing Single Translation")
    print("=" * 60)
    
    test_cases = [
        {
            "text": "How are you today?",
            "target_language": "Hindi"
        },
        {
            "text": "Good morning",
            "target_language": "Tamil"
        },
        {
            "text": "Thank you very much",
            "target_language": "Telugu"
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest {i}:")
        print(f"  Input: {test_case['text']}")
        print(f"  Target Language: {test_case['target_language']}")
        
        result = await translate_text(**test_case)
        
        if result.get("success"):
            print(f"  ✓ Translation: {result['translated_text']}")
            print(f"  Model: {result['model']}")
            print(f"  Tokens used: {result.get('usage', {})}")
        else:
            print(f"  ✗ Error: {result.get('error')}")
            print(f"  Detail: {result.get('detail', result.get('message'))}")


async def test_batch_translation():
    """Test batch translation"""
    print("\n" + "=" * 60)
    print("Testing Batch Translation")
    print("=" * 60)
    
    texts = [
        "Hello",
        "Goodbye",
        "Thank you",
        "Please",
        "Welcome"
    ]
    
    print(f"\nTranslating {len(texts)} texts to Hindi:")
    for text in texts:
        print(f"  - {text}")
    
    result = await batch_translate(
        texts=texts,
        target_language="Hindi"
    )
    
    print(f"\nResults:")
    print(f"  Total: {result['total_count']}")
    print(f"  Successful: {result['successful_count']}")
    print(f"  Failed: {result['failed_count']}")
    
    print(f"\nTranslations:")
    for translation in result['translations']:
        if translation['success']:
            print(f"  ✓ {translation['text']} → {translation['translated_text']}")
        else:
            print(f"  ✗ {translation['text']} → Error: {translation['error']}")


async def test_with_source_language():
    """Test translation with explicit source language"""
    print("\n" + "=" * 60)
    print("Testing Translation with Source Language")
    print("=" * 60)
    
    result = await translate_text(
        text="नमस्ते",
        target_language="English",
        source_language="Hindi"
    )
    
    print(f"\nInput: नमस्ते (Hindi)")
    print(f"Target: English")
    
    if result.get("success"):
        print(f"✓ Translation: {result['translated_text']}")
    else:
        print(f"✗ Error: {result.get('error')}")


async def test_error_handling():
    """Test error handling with invalid input"""
    print("\n" + "=" * 60)
    print("Testing Error Handling")
    print("=" * 60)
    
    # Test with empty text
    print("\nTest 1: Empty text")
    try:
        result = await translate_text(
            text="",
            target_language="Hindi"
        )
        print(f"  Result: {result}")
    except ValueError as e:
        print(f"  ✓ Caught expected error: {e}")
    
    # Test with missing target language
    print("\nTest 2: Missing target language")
    try:
        result = await translate_text(
            text="Hello",
            target_language=""
        )
        print(f"  Result: {result}")
    except ValueError as e:
        print(f"  ✓ Caught expected error: {e}")


async def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("Translation MCP Server - Test Suite")
    print("=" * 60)
    print(f"\nUsing vLLM endpoint: {os.getenv('VLLM_ENDPOINT', 'http://localhost:8012/v1/chat/completions')}")
    print(f"Model: sarvamai/sarvam-translate")
    
    try:
        await test_single_translation()
        await test_batch_translation()
        await test_with_source_language()
        await test_error_handling()
        
        print("\n" + "=" * 60)
        print("All tests completed!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Test suite failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
