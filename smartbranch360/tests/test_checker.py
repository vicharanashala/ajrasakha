#!/usr/bin/env python3
"""
Unit and Integration Test Suite for SmartBranch 360 Network Checker Tool
"""

import unittest
import json
import sys
from pathlib import Path

# Add parent directory to path so smartbranch_checker can be imported
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

from smartbranch_checker import SmartBranchChecker, load_plan


class TestSmartBranchChecker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = Path(__file__).parent.parent.resolve()
        cls.plan_file = cls.base_dir / "network_plan.json"
        cls.sample_dir = cls.base_dir / "cisco_configs" / "sample_show_outputs"
        cls.plan_data = load_plan(str(cls.plan_file))

    def test_working_network_baseline(self):
        config_path = self.sample_dir / "working_network.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        findings = checker.validate()

        self.assertEqual(checker.summary["fail"], 0, "Working network baseline should have 0 failures")
        self.assertEqual(checker.summary["pass"], len(findings), "All validated rules should pass on healthy baseline")

    def test_fault1_missing_vlan(self):
        config_path = self.sample_dir / "fault1_missing_vlan.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        checker.validate()

        self.assertGreater(checker.summary["fail"], 0)
        fail_titles = [f["title"] for f in checker.findings if f["category"] == "FAIL"]
        self.assertTrue(any("Missing on Trunk" in t for t in fail_titles), "Should detect missing VLAN 20 on trunk")

    def test_fault2_wrong_gateway(self):
        config_path = self.sample_dir / "fault2_wrong_gateway.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        checker.validate()

        self.assertGreater(checker.summary["fail"], 0)
        fail_titles = [f["title"] for f in checker.findings if f["category"] == "FAIL"]
        self.assertTrue(any("Incorrect Gateway IP" in t for t in fail_titles), "Should detect wrong IP gateway on GigabitEthernet0/0.10")

    def test_fault3_dhcp_broken(self):
        config_path = self.sample_dir / "fault3_dhcp_broken.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        checker.validate()

        self.assertGreater(checker.summary["fail"], 0)
        fail_titles = [f["title"] for f in checker.findings if f["category"] == "FAIL"]
        self.assertTrue(any("Default Gateway" in t for t in fail_titles), "Should detect missing default-router in DHCP pool")

    def test_fault4_acl_block(self):
        config_path = self.sample_dir / "fault4_acl_block.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        checker.validate()

        self.assertGreater(checker.summary["fail"], 0)
        fail_titles = [f["title"] for f in checker.findings if f["category"] == "FAIL"]
        self.assertTrue(any("Blocks DNS Resolution" in t for t in fail_titles), "Should detect ACL over-blocking DNS access")

    def test_fault5_nat_missing(self):
        config_path = self.sample_dir / "fault5_nat_missing.txt"
        with open(config_path, "r", encoding="utf-8") as f:
            config_text = f.read()

        checker = SmartBranchChecker(self.plan_data, config_text)
        checker.validate()

        self.assertGreater(checker.summary["fail"], 0)
        fail_titles = [f["title"] for f in checker.findings if f["category"] == "FAIL"]
        self.assertTrue(any("Missing NAT Overload" in t for t in fail_titles), "Should detect missing NAT overload configuration")


if __name__ == "__main__":
    unittest.main()
