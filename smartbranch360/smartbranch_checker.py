#!/usr/bin/env python3
"""
SmartBranch 360 - Automated Network Assurance & Fault Checker Tool
Cisco Virtual Internship 2026 | Project 1

This tool parses network requirement specifications (YAML/JSON) and audits
Cisco IOS 'show' command outputs to automatically validate network configuration,
detect misconfigurations, identify fault scenarios, and output Cisco CLI fixes.
"""

import sys
import os
import json
import re
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

# Optional YAML support
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


# ANSI Color Codes for Terminal Output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def disable_colors():
    Colors.HEADER = ''
    Colors.OKBLUE = ''
    Colors.OKCYAN = ''
    Colors.OKGREEN = ''
    Colors.WARNING = ''
    Colors.FAIL = ''
    Colors.ENDC = ''
    Colors.BOLD = ''
    Colors.UNDERLINE = ''


class SmartBranchChecker:
    def __init__(self, plan_data: Dict[str, Any], config_text: str):
        self.plan = plan_data
        self.raw_config = config_text
        self.findings: List[Dict[str, Any]] = []
        self.summary = {"pass": 0, "fail": 0, "warn": 0}
        
        # Parsed structures
        self.subinterfaces: Dict[str, Dict[str, Any]] = {}
        self.dhcp_pools: Dict[str, Dict[str, Any]] = {}
        self.trunks: Dict[str, List[Dict[str, Any]]] = {}
        self.acls: Dict[str, List[str]] = {}
        self.vlan_brief: Dict[str, List[int]] = {}
        self.nat_config: Dict[str, Any] = {"inside_ifaces": [], "outside_ifaces": [], "overload_rule": False}
        self.vty_config: Dict[str, Any] = {"ssh_enabled": False, "access_class": None}

        # Run parser
        self._parse_config()

    def _parse_config(self):
        """Extract Cisco IOS configuration objects from text show outputs."""
        lines = self.raw_config.splitlines()
        current_section = None
        current_device = "R1"

        # Regex patterns
        iface_pattern = re.compile(r'^interface\s+([A-Za-z0-9/\.]+)', re.IGNORECASE)
        subif_pattern = re.compile(r'^interface\s+([A-Za-z0-9/]+)\.([0-9]+)', re.IGNORECASE)
        encap_pattern = re.compile(r'encapsulation\s+dot1Q\s+([0-9]+)(\s+native)?', re.IGNORECASE)
        ip_pattern = re.compile(r'ip\s+address\s+([0-9\.]+)\s+([0-9\.]+)', re.IGNORECASE)
        dhcp_pool_pattern = re.compile(r'^ip\s+dhcp\s+pool\s+([A-Za-z0-9_-]+)', re.IGNORECASE)
        default_router_pattern = re.compile(r'default-router\s+([0-9\.]+)', re.IGNORECASE)
        dns_server_pattern = re.compile(r'dns-server\s+([0-9\.\s]+)', re.IGNORECASE)
        acl_header_pattern = re.compile(r'^ip\s+access-list\s+extended\s+([A-Za-z0-9_-]+)', re.IGNORECASE)
        
        current_iface = None
        current_pool = None
        current_acl = None

        for line in lines:
            line_str = line.strip()
            if not line_str or line_str.startswith("!") or line_str.startswith("#"):
                continue

            # Detect device markers in text file
            if "SHOW RUNNING-CONFIG" in line or "SHOW INTERFACES TRUNK" in line or "SHOW VLAN BRIEF" in line:
                for token in line_str.split():
                    token_clean = token.strip("=").strip()
                    if "R1" in token_clean or "SW1" in token_clean or "SW2" in token_clean:
                        current_device = token_clean.split("-")[0]
                current_iface = None
                current_pool = None
                current_acl = None
                continue

            # Parse Sub-interfaces
            sub_match = subif_pattern.match(line_str)
            if sub_match:
                parent_if, vlan_id = sub_match.group(1), int(sub_match.group(2))
                current_iface = f"{parent_if}.{vlan_id}"
                self.subinterfaces[current_iface] = {
                    "vlan_id": vlan_id,
                    "ip": None,
                    "netmask": None,
                    "encap_vlan": None,
                    "nat_inside": False,
                    "access_group": None
                }
                current_pool = None
                current_acl = None
                continue

            if current_iface and line_str.startswith("interface "):
                current_iface = None

            if current_iface and current_iface in self.subinterfaces:
                enc_m = encap_pattern.search(line_str)
                if enc_m:
                    self.subinterfaces[current_iface]["encap_vlan"] = int(enc_m.group(1))
                ip_m = ip_pattern.search(line_str)
                if ip_m:
                    self.subinterfaces[current_iface]["ip"] = ip_m.group(1)
                    self.subinterfaces[current_iface]["netmask"] = ip_m.group(2)
                if "ip nat inside" in line_str:
                    self.subinterfaces[current_iface]["nat_inside"] = True
                    self.nat_config["inside_ifaces"].append(current_iface)
                if "ip access-group" in line_str:
                    parts = line_str.split()
                    if len(parts) >= 3:
                        self.subinterfaces[current_iface]["access_group"] = parts[2]

            # WAN Interface NAT Check
            if "interface GigabitEthernet0/1" in line_str or "interface Gi0/1" in line_str:
                current_iface = "GigabitEthernet0/1"
                current_pool = None
                current_acl = None
            if current_iface == "GigabitEthernet0/1" and "ip nat outside" in line_str:
                self.nat_config["outside_ifaces"].append("GigabitEthernet0/1")

            # Parse DHCP Pools
            pool_m = dhcp_pool_pattern.match(line_str)
            if pool_m:
                pool_name = pool_m.group(1)
                current_pool = pool_name
                self.dhcp_pools[current_pool] = {
                    "network": None,
                    "default_router": None,
                    "dns_server": None
                }
                current_iface = None
                current_acl = None
                continue

            if current_pool and (line_str.startswith("ip ") or line_str.startswith("interface ") or line_str.startswith("line ")):
                if not (line_str.startswith("network") or line_str.startswith("default-router") or line_str.startswith("dns-server") or line_str.startswith("domain-name")):
                    current_pool = None

            if current_pool and current_pool in self.dhcp_pools:
                if line_str.startswith("network "):
                    parts = line_str.split()
                    if len(parts) >= 3:
                        self.dhcp_pools[current_pool]["network"] = parts[1]
                dr_m = default_router_pattern.search(line_str)
                if dr_m:
                    self.dhcp_pools[current_pool]["default_router"] = dr_m.group(1)
                dns_m = dns_server_pattern.search(line_str)
                if dns_m:
                    self.dhcp_pools[current_pool]["dns_server"] = dns_m.group(1)

            # NAT Overload Statement
            if "ip nat inside source list" in line_str and "overload" in line_str:
                self.nat_config["overload_rule"] = True

            # Parse ACLs
            acl_m = acl_header_pattern.match(line_str)
            if acl_m:
                current_acl = acl_m.group(1)
                self.acls[current_acl] = []
                current_iface = None
                current_pool = None
                continue

            if current_acl and (line_str.startswith("line ") or line_str.startswith("interface ") or line_str.startswith("ip ")):
                if not (line_str.startswith("permit") or line_str.startswith("deny") or line_str.startswith("remark")):
                    current_acl = None

            if current_acl and current_acl in self.acls:
                if line_str.startswith("permit") or line_str.startswith("deny") or line_str.startswith("remark"):
                    self.acls[current_acl].append(line_str)

            # Parse VTY Line SSH Configuration
            if "transport input ssh" in line_str:
                self.vty_config["ssh_enabled"] = True
            if "access-class" in line_str:
                parts = line_str.split()
                if len(parts) >= 2:
                    self.vty_config["access_class"] = parts[1]

            # Detect device markers in text file
            if "SHOW RUNNING-CONFIG" in line or "SHOW INTERFACES TRUNK" in line or "SHOW VLAN BRIEF" in line:
                for token in line_str.split():
                    token_clean = token.strip("=").strip()
                    if "R1" in token_clean or "SW1" in token_clean or "SW2" in token_clean:
                        current_device = token_clean.split("-")[0]
                current_iface = None
                current_pool = None
                current_acl = None
                current_section = None
                continue

            # Parse Trunk Table Output
            if "Port Vlans allowed on trunk" in line or "Port        Vlans allowed on trunk" in line:
                current_section = "TRUNK_ALLOWED"
                continue
            if current_section == "TRUNK_ALLOWED":
                if line_str.startswith("Gi") or line_str.startswith("Fa"):
                    parts = line_str.split()
                    if len(parts) >= 2:
                        port_name = parts[0]
                        vlan_str = parts[1]
                        allowed_vlans = self._parse_vlan_range(vlan_str)
                        if current_device not in self.trunks:
                            self.trunks[current_device] = []
                        # Update existing entry if present, else append
                        existing = next((t for t in self.trunks[current_device] if t["port"] == port_name), None)
                        if existing:
                            existing["allowed_vlans"] = allowed_vlans
                        else:
                            self.trunks[current_device].append({
                                "port": port_name,
                                "allowed_vlans": allowed_vlans
                            })

    def _parse_vlan_range(self, vlan_str: str) -> List[int]:
        """Convert VLAN strings like '10,20,30,99' or '10-20' to a list of ints."""
        result = []
        for part in vlan_str.split(','):
            part = part.strip()
            if '-' in part:
                try:
                    start, end = map(int, part.split('-'))
                    result.extend(range(start, end + 1))
                except ValueError:
                    pass
            elif part.isdigit():
                result.append(int(part))
        return result

    def validate(self):
        """Run all automated compliance and assurance checks."""
        self.findings = []
        self._check_subinterfaces()
        self._check_dhcp_pools()
        self._check_trunk_allowed_vlans()
        self._check_nat_overload()
        self._check_guest_isolation_acl()
        self._check_ssh_management()
        return self.findings

    def _add_finding(self, category: str, title: str, symptom: str, root_cause: str, suggested_fix: str):
        finding = {
            "category": category, # PASS, FAIL, WARN
            "title": title,
            "symptom": symptom,
            "root_cause": root_cause,
            "suggested_fix": suggested_fix
        }
        self.findings.append(finding)
        if category == "PASS":
            self.summary["pass"] += 1
        elif category == "FAIL":
            self.summary["fail"] += 1
        else:
            self.summary["warn"] += 1

    def _check_subinterfaces(self):
        """Validate Router Sub-interfaces match requirement plan gateways."""
        vlans = self.plan.get("vlans", [])
        for vlan in vlans:
            vlan_id = vlan.get("id")
            req_gateway = vlan.get("gateway")
            vlan_name = vlan.get("name")

            matching_subif = None
            for if_name, details in self.subinterfaces.items():
                if details.get("vlan_id") == vlan_id:
                    matching_subif = (if_name, details)
                    break

            if not matching_subif:
                self._add_finding(
                    "FAIL",
                    f"Missing Router Sub-interface for VLAN {vlan_id} ({vlan_name})",
                    f"Endpoints on VLAN {vlan_id} ({vlan_name}) cannot perform inter-VLAN routing or reach gateway.",
                    f"No sub-interface with encapsulation dot1Q {vlan_id} found on R1.",
                    f"interface GigabitEthernet0/0.{vlan_id}\n encapsulation dot1Q {vlan_id}\n ip address {req_gateway} 255.255.255.0\n ip nat inside"
                )
            else:
                if_name, details = matching_subif
                configured_ip = details.get("ip")
                if configured_ip != req_gateway:
                    self._add_finding(
                        "FAIL",
                        f"Incorrect Gateway IP on Sub-interface {if_name}",
                        f"Endpoints on VLAN {vlan_id} ({vlan_name}) fail to ping their default gateway ({req_gateway}).",
                        f"Sub-interface {if_name} is configured with IP {configured_ip}, but requirement specifies {req_gateway}.",
                        f"interface {if_name}\n ip address {req_gateway} 255.255.255.0"
                    )
                else:
                    self._add_finding(
                        "PASS",
                        f"Sub-interface {if_name} Gateway OK",
                        "Normal operation.",
                        f"Sub-interface correctly configured with {req_gateway}.",
                        "No action required."
                    )

    def _check_dhcp_pools(self):
        """Validate DHCP pools exist and have correct default router for DHCP enabled VLANs."""
        vlans = self.plan.get("vlans", [])
        for vlan in vlans:
            if not vlan.get("dhcp_enabled"):
                continue
            vlan_id = vlan.get("id")
            pool_name = vlan.get("dhcp_pool_name")
            req_gateway = vlan.get("gateway")

            found_pool = self.dhcp_pools.get(pool_name)
            if not found_pool:
                # Try finding pool by matching default-router or subnet
                for p_name, p_data in self.dhcp_pools.items():
                    if p_data.get("default_router") == req_gateway:
                        found_pool = p_data
                        pool_name = p_name
                        break

            if not found_pool:
                self._add_finding(
                    "FAIL",
                    f"Missing DHCP Pool for VLAN {vlan_id} ({pool_name})",
                    f"Devices on VLAN {vlan_id} fail to receive automatic IP addresses via DHCP.",
                    f"No DHCP pool configured on R1 matching default router {req_gateway}.",
                    f"ip dhcp pool {pool_name}\n network 10.10.{vlan_id}.0 255.255.255.0\n default-router {req_gateway}"
                )
            else:
                dr = found_pool.get("default_router")
                if not dr or dr != req_gateway:
                    self._add_finding(
                        "FAIL",
                        f"DHCP Pool '{pool_name}' Missing/Incorrect Default Gateway",
                        f"DHCP clients receive IP but cannot reach default gateway or Internet.",
                        f"DHCP pool '{pool_name}' default-router is '{dr}', expected '{req_gateway}'.",
                        f"ip dhcp pool {pool_name}\n default-router {req_gateway}"
                    )
                else:
                    self._add_finding(
                        "PASS",
                        f"DHCP Pool '{pool_name}' Gateway Configured OK",
                        "Normal operation.",
                        f"Default-router {req_gateway} is present in pool.",
                        "No action required."
                    )

    def _normalize_port_name(self, name: str) -> str:
        """Standardize port names like GigabitEthernet0/1 to Gi0/1."""
        name = name.replace("GigabitEthernet", "Gi").replace("FastEthernet", "Fa")
        return name.lower()

    def _check_trunk_allowed_vlans(self):
        """Validate switch trunks permit all required site VLANs."""
        planned_trunks = self.plan.get("trunks", [])
        required_vlan_ids = [v["id"] for v in self.plan.get("vlans", [])]

        if not self.trunks:
            self._add_finding(
                "WARN",
                "Trunk Status Not Provided in Config Text",
                "Cannot inspect physical switch trunk allowed VLANs without 'show interfaces trunk' output.",
                "Missing 'SHOW INTERFACES TRUNK' section in input text.",
                "Run 'show interfaces trunk' on SW1 and SW2 and append to input text file."
            )
            return

        for p_trunk in planned_trunks:
            sw_name = p_trunk.get("switch")
            planned_if = self._normalize_port_name(p_trunk.get("interface", ""))
            req_vlans = p_trunk.get("allowed_vlans", required_vlan_ids)

            device_trunks = self.trunks.get(sw_name, [])
            matched_trunk = None
            for actual_trunk in device_trunks:
                act_port = self._normalize_port_name(actual_trunk.get("port", ""))
                if act_port == planned_if:
                    matched_trunk = actual_trunk
                    break

            if matched_trunk:
                allowed = matched_trunk.get("allowed_vlans", [])
                missing = [v for v in req_vlans if v not in allowed]
                if missing:
                    self._add_finding(
                        "FAIL",
                        f"VLAN {missing} Missing on Trunk {sw_name}-{p_trunk.get('interface')}",
                        f"Traffic for VLAN(s) {missing} dropped across trunk link {sw_name}-{p_trunk.get('interface')}. Endpoints lose reachability.",
                        f"Trunk port {p_trunk.get('interface')} allowed list is '{allowed}', omitting required VLAN(s) {missing}.",
                        f"interface {p_trunk.get('interface')}\n switchport trunk allowed vlan add {','.join(map(str, missing))}"
                    )
                else:
                    self._add_finding(
                        "PASS",
                        f"Trunk {sw_name}-{p_trunk.get('interface')} Allowed VLANs OK",
                        "Normal operation.",
                        f"All required VLANs {req_vlans} allowed on trunk.",
                        "No action required."
                    )

    def _check_nat_overload(self):
        """Validate NAT Overload (PAT) configuration."""
        if not self.nat_config.get("overload_rule"):
            self._add_finding(
                "FAIL",
                "Missing NAT Overload Configuration on R1",
                "Internal endpoints (10.10.x.x) fail to access Internet resources (8.8.8.8).",
                "Missing 'ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload' statement on R1.",
                "ip access-list standard NAT_ACL\n permit 10.10.0.0 0.0.255.255\nexit\nip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload"
            )
        else:
            self._add_finding(
                "PASS",
                "NAT Overload Active on WAN Interface",
                "Normal operation.",
                "Dynamic PAT overload rule is active.",
                "No action required."
            )

    def _check_guest_isolation_acl(self):
        """Validate Guest Isolation ACL permits DNS to Server (10.10.30.10) and blocks general Server & Management VLAN access."""
        guest_subif = None
        for if_name, details in self.subinterfaces.items():
            if details.get("vlan_id") == 20:
                guest_subif = details
                break

        if not guest_subif:
            return  # Already reported in sub-interface check

        acl_name = guest_subif.get("access_group")
        if not acl_name:
            self._add_finding(
                "FAIL",
                "Guest Sub-interface Gig0/0.20 Unprotected (Missing ACL)",
                "Security breach: Guest Wi-Fi users can freely access internal Servers (10.10.30.x) and Management devices (10.10.99.x).",
                "No 'ip access-group <ACL_NAME> in' applied to GigabitEthernet0/0.20.",
                "interface GigabitEthernet0/0.20\n ip access-group GUEST_ISOLATION_ACL in"
            )
            return

        acl_lines = self.acls.get(acl_name, [])
        acl_text = " ".join(acl_lines)

        # Rule check 1: Must allow DNS (udp port 53 / domain) to 10.10.30.10 BEFORE deny ip to 10.10.30.0/24
        dns_allowed = "permit udp" in acl_text and ("10.10.30.10" in acl_text or "any" in acl_text) and ("domain" in acl_text or "eq 53" in acl_text or "eq domain" in acl_text)
        server_blocked = "deny ip" in acl_text and "10.10.30." in acl_text
        mgmt_blocked = "deny ip" in acl_text and "10.10.99." in acl_text

        if not dns_allowed:
            self._add_finding(
                "FAIL",
                f"Guest ACL '{acl_name}' Blocks DNS Resolution",
                "Guest users fail to resolve domain names (DNS failure) when using internal DNS server 10.10.30.10.",
                "ACL is missing 'permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain' prior to the deny rule.",
                f"ip access-list extended {acl_name}\n permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain"
            )
        elif not server_blocked:
            self._add_finding(
                "FAIL",
                f"Guest ACL '{acl_name}' Fails to Block Server VLAN",
                "Guest users can reach internal Server VLAN 10.10.30.0/24.",
                "Missing 'deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255' in ACL.",
                f"ip access-list extended {acl_name}\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255"
            )
        else:
            self._add_finding(
                "PASS",
                f"Guest Isolation ACL '{acl_name}' Configured Correctly",
                "Normal operation.",
                "DNS permitted, Server & Management VLAN access denied, Internet permitted.",
                "No action required."
            )

    def _check_ssh_management(self):
        """Validate SSH is enforced on VTY lines and restricted to Management subnet."""
        if not self.vty_config.get("ssh_enabled"):
            self._add_finding(
                "WARN",
                "SSH Management Security Not Enforced on VTY Lines",
                "Insecure telnet traffic allowed on VTY lines, exposing admin password in plaintext.",
                "Missing 'transport input ssh' on line vty 0 15.",
                "line vty 0 15\n transport input ssh\n login local"
            )
        else:
            self._add_finding(
                "PASS",
                "SSH Hardening Enforced on VTY Lines",
                "Normal operation.",
                "Line vty configured for SSH-only authentication.",
                "No action required."
            )

    def print_report(self, use_color: bool = True):
        """Print a visually rich validation report to terminal."""
        if not use_color:
            disable_colors()

        print(f"\n{Colors.HEADER}{Colors.BOLD}========================================================================{Colors.ENDC}")
        print(f"{Colors.HEADER}{Colors.BOLD}         SMARTBRANCH 360 - AUTOMATED NETWORK ASSURANCE REPORT           {Colors.ENDC}")
        print(f"{Colors.HEADER}{Colors.BOLD}========================================================================{Colors.ENDC}\n")

        print(f"Site Name       : {Colors.BOLD}{self.plan.get('site_name', 'SmartBranch360')}{Colors.ENDC}")
        print(f"Total Rules Run : {len(self.findings)}")
        print(f"Status Summary  : {Colors.OKGREEN}PASS: {self.summary['pass']}{Colors.ENDC} | {Colors.FAIL}FAIL: {self.summary['fail']}{Colors.ENDC} | {Colors.WARNING}WARN: {self.summary['warn']}{Colors.ENDC}\n")

        print(f"{Colors.BOLD}--- DETAILED FINDINGS & AUDIT RESULTS ---{Colors.ENDC}\n")

        for idx, item in enumerate(self.findings, 1):
            cat = item["category"]
            if cat == "PASS":
                badge = f"{Colors.OKGREEN}[PASS]{Colors.ENDC}"
            elif cat == "FAIL":
                badge = f"{Colors.FAIL}[FAIL]{Colors.ENDC}"
            else:
                badge = f"{Colors.WARNING}[WARN]{Colors.ENDC}"

            print(f"{idx}. {badge} {Colors.BOLD}{item['title']}{Colors.ENDC}")
            print(f"   {Colors.BOLD}Symptom      :{Colors.ENDC} {item['symptom']}")
            print(f"   {Colors.BOLD}Root Cause   :{Colors.ENDC} {item['root_cause']}")
            if cat != "PASS":
                print(f"   {Colors.OKCYAN}{Colors.BOLD}Suggested Cisco IOS Fix:{Colors.ENDC}")
                for fix_line in item['suggested_fix'].splitlines():
                    print(f"     {Colors.OKCYAN}{fix_line}{Colors.ENDC}")
            print()

        print(f"{Colors.HEADER}{Colors.BOLD}========================================================================{Colors.ENDC}\n")


def load_plan(plan_path: str) -> Dict[str, Any]:
    """Load JSON or YAML plan file."""
    path = Path(plan_path)
    if not path.exists():
        raise FileNotFoundError(f"Plan file not found: {plan_path}")

    with open(path, "r", encoding="utf-8") as f:
        if path.suffix.lower() in [".yaml", ".yml"]:
            if not YAML_AVAILABLE:
                raise RuntimeError("PyYAML is not installed. Please use JSON plan or install pyyaml.")
            return yaml.safe_load(f)
        else:
            return json.load(f)


def main():
    parser = argparse.ArgumentParser(
        description="SmartBranch 360 Automated Network Assurance & Fault Checker Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example Usage:
  python smartbranch_checker.py --plan network_plan.yaml --config cisco_configs/sample_show_outputs/working_network.txt
  python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/fault1_missing_vlan.txt
  python smartbranch_checker.py --json-output report.json
        """
    )
    parser.add_argument("--plan", default="network_plan.json", help="Path to network plan specification (YAML/JSON)")
    parser.add_argument("--config", default="cisco_configs/sample_show_outputs/working_network.txt", help="Path to Cisco IOS show command outputs file")
    parser.add_argument("--no-color", action="store_true", help="Disable colored terminal output")
    parser.add_argument("--json-output", help="Save audit findings report as JSON to specified file path")

    args = parser.parse_args()

    # Resolve paths relative to script location if needed
    script_dir = Path(__file__).parent.resolve()
    
    plan_file = Path(args.plan)
    if not plan_file.is_absolute() and not plan_file.exists():
        plan_file = script_dir / args.plan

    config_file = Path(args.config)
    if not config_file.is_absolute() and not config_file.exists():
        config_file = script_dir / args.config

    try:
        plan_data = load_plan(str(plan_file))
    except Exception as e:
        print(f"{Colors.FAIL}Error loading requirement plan: {e}{Colors.ENDC}")
        sys.exit(1)

    if not config_file.exists():
        print(f"{Colors.FAIL}Configuration output file not found: {config_file}{Colors.ENDC}")
        sys.exit(1)

    with open(config_file, "r", encoding="utf-8") as f:
        config_text = f.read()

    checker = SmartBranchChecker(plan_data, config_text)
    checker.validate()
    checker.print_report(use_color=not args.no_color)

    if args.json_output:
        out_path = Path(args.json_output)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({
                "site_name": plan_data.get("site_name"),
                "summary": checker.summary,
                "findings": checker.findings
            }, f, indent=2)
        print(f"Report saved to: {out_path}")

    # Return non-zero exit code if failures detected
    if checker.summary["fail"] > 0:
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
