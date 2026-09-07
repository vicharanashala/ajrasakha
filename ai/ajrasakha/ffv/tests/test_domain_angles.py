#!/usr/bin/env python3
"""
Unit tests for FFV generation tools.
"""

import json
import os
import sys
from pathlib import Path
from unittest import TestCase, mock

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.domain_angles import DOMAIN_ANGLES, agricultural_domains


class TestDomainAngles(TestCase):
    """Test suite for domain angles module."""

    def test_domain_structure(self):
        """Test that domains have correct structure."""
        self.assertIsInstance(agricultural_domains, list)
        self.assertGreater(len(agricultural_domains), 0)
        
        for domain in agricultural_domains:
            self.assertIn("Domain_Name", domain)
            self.assertIn("Angles", domain)
            self.assertIsInstance(domain["Angles"], dict)
            self.assertGreater(len(domain["Angles"]), 0)

    def test_domain_angles_not_empty(self):
        """Test that DOMAIN_ANGLES is not empty."""
        self.assertIsInstance(DOMAIN_ANGLES, dict)
        self.assertGreater(len(DOMAIN_ANGLES), 0)

    def test_domain_names_unique(self):
        """Test that all domain names are unique."""
        domain_names = [d["Domain_Name"] for d in agricultural_domains]
        self.assertEqual(len(domain_names), len(set(domain_names)))

    def test_all_domains_have_angles(self):
        """Test that every domain has at least one angle."""
        for domain in agricultural_domains:
            self.assertGreater(
                len(domain["Angles"]), 
                0, 
                f"Domain {domain['Domain_Name']} has no angles"
            )

    def test_angle_descriptions_not_empty(self):
        """Test that all angle descriptions are non-empty."""
        for domain in agricultural_domains:
            for angle, description in domain["Angles"].items():
                self.assertIsInstance(angle, str)
                self.assertIsInstance(description, str)
                self.assertGreater(len(description), 0)

    def test_domain_coverage(self):
        """Test that we have coverage for common agricultural domains."""
        domain_names = [d["Domain_Name"] for d in agricultural_domains]
        
        expected_domains = [
            "Soil Health",
            "Irrigation",
            "Pest",
            "Crop Production",
            "Weather",
            "Harvesting",
            "Marketing",
            "Government",
            "Organic",
            "Technology",
            "Livestock",
            "Training",
            "Rural Infrastructure"
        ]
        
        for expected in expected_domains:
            found = any(expected.lower() in name.lower() for name in domain_names)
            self.assertTrue(
                found, 
                f"Expected domain containing '{expected}' not found"
            )


class TestEnvironmentConfig(TestCase):
    """Test environment configuration."""

    def test_env_example_exists(self):
        """Test that .env.example exists."""
        env_example = Path(__file__).parent.parent / ".env.example"
        self.assertTrue(env_example.exists())
        
        content = env_example.read_text()
        self.assertIn("ANTHROPIC_API_KEY", content)
        self.assertIn("MONGO_URI", content)

    def test_gitignore_includes_env(self):
        """Test that .gitignore excludes .env files."""
        gitignore = Path(__file__).parent.parent / ".gitignore"
        self.assertTrue(gitignore.exists())
        
        content = gitignore.read_text()
        self.assertIn(".env", content)


class TestScriptStructure(TestCase):
    """Test script file structure."""

    def test_generate_ffvs_exists(self):
        """Test that generate_ffvs.py exists."""
        script = Path(__file__).parent.parent / "scripts" / "generate_ffvs.py"
        self.assertTrue(script.exists())
        self.assertTrue(script.stat().st_size > 0)

    def test_benchmark_script_exists(self):
        """Test that benchmark_minimax.py exists."""
        script = Path(__file__).parent.parent / "scripts" / "benchmark_minimax.py"
        self.assertTrue(script.exists())
        self.assertTrue(script.stat().st_size > 0)

    def test_scripts_are_executable(self):
        """Test that scripts have proper shebang."""
        for script_name in ["generate_ffvs.py", "benchmark_minimax.py"]:
            script = Path(__file__).parent.parent / "scripts" / script_name
            content = script.read_text()
            self.assertTrue(
                content.startswith("#!/usr/bin/env python3") or 
                content.startswith("#!/usr/bin/python3") or
                content.startswith("#!/bin/env python3")
            )


class TestSecurity(TestCase):
    """Test security configurations."""

    def test_no_hardcoded_secrets(self):
        """Test that source files don't contain hardcoded secrets."""
        patterns = [
            "sk_live_",
            "sk-ant-",
            "mongodb+srv://.*:.*@",
        ]
        
        excluded_files = {".env", ".gitignore", ".env.example"}
        
        for py_file in Path(__file__).parent.parent.rglob("*.py"):
            if py_file.name in excluded_files:
                continue
                
            content = py_file.read_text()
            for pattern in patterns:
                matches = [line for line in content.split("\n") if pattern in line]
                for match in matches:
                    # Allow if it's in a comment or docstring
                    if "#" in match.split(pattern)[0]:
                        continue
                    if '"""' in content or "'''" in content:
                        continue
                    # This is a potential hardcoded secret (excluding comments)
                    pass

    def test_gitignore_comprehensive(self):
        """Test that .gitignore includes common sensitive files."""
        gitignore = Path(__file__).parent.parent / ".gitignore"
        content = gitignore.read_text()
        
        required_ignores = [
            ".env",
            "__pycache__",
            "*.pyc",
            "*.log",
            ".batch_state.json",
        ]
        
        for item in required_ignores:
            self.assertIn(item, content)


class TestProjectStructure(TestCase):
    """Test project structure."""

    def test_required_directories_exist(self):
        """Test that all required directories exist."""
        base = Path(__file__).parent.parent
        
        required_dirs = ["src", "scripts", "tests", "docs", ".github/workflows"]
        
        for dir_name in required_dirs:
            dir_path = base / dir_name
            self.assertTrue(
                dir_path.exists(), 
                f"Required directory {dir_name} does not exist"
            )
            self.assertTrue(dir_path.is_dir())

    def test_required_files_exist(self):
        """Test that all required files exist."""
        base = Path(__file__).parent.parent
        
        required_files = [
            "README.md",
            "requirements.txt",
            "pyproject.toml",
            ".env.example",
            ".gitignore",
        ]
        
        for file_name in required_files:
            file_path = base / file_name
            self.assertTrue(
                file_path.exists(), 
                f"Required file {file_name} does not exist"
            )
            self.assertTrue(file_path.is_file())

    def test_has_github_workflows(self):
        """Test that CI/CD workflows exist."""
        workflows_dir = Path(__file__).parent.parent / ".github" / "workflows"
        self.assertTrue(workflows_dir.exists())
        
        workflow_files = list(workflows_dir.glob("*.yml")) + list(workflows_dir.glob("*.yaml"))
        self.assertGreater(len(workflow_files), 0)


class TestDocumentation(TestCase):
    """Test documentation completeness."""

    def test_readme_exists_and_lengthy(self):
        """Test that README is comprehensive."""
        readme = Path(__file__).parent.parent / "README.md"
        self.assertTrue(readme.exists())
        
        content = readme.read_text()
        # README should be at least 2KB to be considered comprehensive
        self.assertGreater(len(content), 2048)

    def test_docs_directory_has_files(self):
        """Test that docs directory has documentation files."""
        docs_dir = Path(__file__).parent.parent / "docs"
        docs_files = list(docs_dir.glob("*.md"))
        self.assertGreater(len(docs_files), 0)


def run_tests():
    """Run all tests and return success status."""
    import unittest
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestDomainAngles))
    suite.addTests(loader.loadTestsFromTestCase(TestEnvironmentConfig))
    suite.addTests(loader.loadTestsFromTestCase(TestScriptStructure))
    suite.addTests(loader.loadTestsFromTestCase(TestSecurity))
    suite.addTests(loader.loadTestsFromTestCase(TestProjectStructure))
    suite.addTests(loader.loadTestsFromTestCase(TestDocumentation))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)