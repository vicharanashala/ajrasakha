# SmartBranch 360 - Enterprise Branch Network & Automated Assurance Tool
**Cisco Virtual Internship 2026 | Project 1**

![Python Assurance Tool](https://img.shields.io/badge/Python-3.8%2B-blue)
![Cisco IOS](https://img.shields.io/badge/Cisco%20IOS-15.x-orange)
![Packet Tracer](https://img.shields.io/badge/Packet%20Tracer-v8.x-green)
![Status](https://img.shields.io/badge/Status-100%25%20Verified-success)

---

## 📌 Project Overview

SmartBranch 360 provides a complete, secure enterprise branch office network design in **Cisco Packet Tracer**, coupled with an automated **Python Network Assurance & Fault Checker Tool**. 

The project satisfies all requirements of the Cisco Virtual Internship 2026:
1. **Network Topology**: Router (R1), 2 Switches (SW1 Core, SW2 Access), Wireless AP, Internal Server (Web/DNS), WAN ISP Cloud, and 8+ endpoints across 4 VLANs.
2. **VLAN Segregation**: Employee (VLAN 10), Guest (VLAN 20), Server (VLAN 30), Management (VLAN 99).
3. **Services**: Router-on-a-Stick Inter-VLAN routing, DHCP server pools per VLAN, NAT Overload (PAT) for Internet reachability, internal DNS lookup.
4. **Security & Management**: Extended ACL for Guest VLAN isolation, SSH-only remote management restricted to Management VLAN 99.
5. **Python Assurance Tool**: Automated CLI tool to audit Cisco `show` command outputs against `network_plan.yaml`/`network_plan.json` requirements, report configuration anomalies, and provide instant Cisco IOS fix commands.

---

## 📁 Repository Structure

```
smartbranch360/
├── README.md                          # Project Documentation & Quickstart
├── network_plan.yaml                  # YAML Network Specification Plan
├── network_plan.json                  # JSON Mirror of Network Plan
├── smartbranch_checker.py             # Python Network Assurance & Fault Checker
├── cisco_configs/
│   ├── R1_Router.cfg                  # Cisco IOS Config for Branch Router R1
│   ├── SW1_CoreSwitch.cfg             # Cisco IOS Config for Core Switch SW1
│   ├── SW2_AccessSwitch.cfg           # Cisco IOS Config for Access Switch SW2
│   └── sample_show_outputs/           # Sample Cisco show outputs for testing
│       ├── working_network.txt        # Baseline healthy network show outputs
│       ├── fault1_missing_vlan.txt    # Fault 1: Missing VLAN on Trunk
│       ├── fault2_wrong_gateway.txt   # Fault 2: Incorrect Subnet Gateway IP
│       ├── fault3_dhcp_broken.txt     # Fault 3: Broken DHCP Pool Config
│       ├── fault4_acl_block.txt       # Fault 4: ACL Over-blocking DNS
│       └── fault5_nat_missing.txt     # Fault 5: Missing NAT Overload Rule
├── docs/
│   ├── DESIGN_DOCUMENT.md             # Complete Technical Design Document
│   ├── FAULT_CARDS.md                 # 5 Written Fault Cards & Troubleshooting Guide
│   └── DEMO_SCRIPT.md                 # Step-by-step Demo Video Presentation Script
└── tests/
    └── test_checker.py                # Automated Unit Test Suite for Python Tool
```

---

## 🚀 Quickstart Guide

### 1. Run Automated Unit Tests
To verify the Python Assurance Tool across all healthy baseline and fault scenario datasets:
```bash
python -m unittest tests/test_checker.py
```

### 2. Audit Healthy Baseline Network
```bash
python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/working_network.txt
```
*Expected Output*: 100% `[PASS]` status across all rules.

### 3. Diagnose Fault Scenarios
Test any injected fault file to view root cause diagnosis and suggested Cisco IOS fixes:
```bash
# Test Missing VLAN on Trunk (Fault 1)
python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/fault1_missing_vlan.txt

# Test Incorrect Gateway IP (Fault 2)
python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/fault2_wrong_gateway.txt
```

### 4. Export Audit Findings to JSON
```bash
python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/fault1_missing_vlan.txt --json-output report.json
```

---

## 🛠️ Building in Cisco Packet Tracer

1. Open **Cisco Packet Tracer**.
2. Add 1 Router (Cisco 2911 / 4331), 2 Switches (Cisco 2960), 1 Access Point, 1 Server, 1 ISP Cloud Router, and 8 PC/Laptop endpoints.
3. Wire devices according to [DESIGN_DOCUMENT.md](docs/DESIGN_DOCUMENT.md).
4. Copy and paste CLI configuration scripts from `cisco_configs/`:
   - Paste [R1_Router.cfg](cisco_configs/R1_Router.cfg) into R1 Router CLI.
   - Paste [SW1_CoreSwitch.cfg](cisco_configs/SW1_CoreSwitch.cfg) into SW1 CLI.
   - Paste [SW2_AccessSwitch.cfg](cisco_configs/SW2_AccessSwitch.cfg) into SW2 CLI.
5. Save topology as `SmartBranch360.pkt`.

---

## 📊 Summary of Deliverables

| Deliverable | File Path | Status |
| :--- | :--- | :--- |
| **Design Document** | [`docs/DESIGN_DOCUMENT.md`](docs/DESIGN_DOCUMENT.md) | ✅ Complete |
| **Cisco CLI Configurations** | [`cisco_configs/`](cisco_configs/) | ✅ Complete & Tested |
| **Requirement Specification** | [`network_plan.yaml`](network_plan.yaml) | ✅ Complete |
| **Python Assurance Tool** | [`smartbranch_checker.py`](smartbranch_checker.py) | ✅ Complete & Verified |
| **5 Written Fault Cards** | [`docs/FAULT_CARDS.md`](docs/FAULT_CARDS.md) | ✅ Complete |
| **Demo Video Script** | [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | ✅ Complete |
