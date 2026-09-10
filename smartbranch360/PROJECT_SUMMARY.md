# SmartBranch 360 - Complete Project Summary & Submission Package
**Cisco Virtual Internship 2026 | Student Problem Statement - Project 1**

---

## 1. Executive Summary

SmartBranch 360 is a secure enterprise branch office network designed and implemented in **Cisco Packet Tracer**, complemented by an automated **Python Network Assurance & Fault Checker Tool**. 

The network establishes segregated traffic domains for Employees, Guests, Internal Servers, and Infrastructure Management. Inter-VLAN routing is accomplished via Router-on-a-Stick (802.1Q sub-interfaces) on Router `R1`, with dynamic IP assignment via DHCP pools, WAN edge Internet access via Dynamic PAT (Port Address Translation), Extended ACL security for Guest isolation, and SSH management hardening.

---

## 2. Network Topology & IP Address Architecture

### 2.1 Logical Topology Diagram (Mermaid)

```mermaid
graph TD
    Cloud[Internet / ISP Cloud<br/>203.0.113.1/30] <-->|WAN Interface| R1[Branch Router R1<br/>Gig0/1: 203.0.113.2/30]
    
    subgraph LAN Core Infrastructure
        R1 <-->|Trunk Gig0/0.10,20,30,99| SW1[SW1 Core Switch<br/>SVI: 10.10.99.2/24]
        SW1 <-->|Trunk Fa0/1| SW2[SW2 Access Switch<br/>SVI: 10.10.99.3/24]
    end

    subgraph VLAN 10 - Employee (10.10.10.0/24)
        SW1 --- |Fa0/2-9| PC_Emp1[Employee PC 1<br/>DHCP: 10.10.10.50]
        SW2 --- |Fa0/6-10| PC_Emp2[Employee PC 2<br/>DHCP: 10.10.10.51]
    end

    subgraph VLAN 20 - Guest (10.10.20.0/24)
        SW2 --- |Fa0/2| WAP[Wireless AP<br/>Guest Wi-Fi]
        SW2 --- |Fa0/3| Guest_PC[Guest PC 1<br/>DHCP: 10.10.20.50]
    end

    subgraph VLAN 30 - Server (10.10.30.0/24)
        SW1 --- |Fa0/10-15| Server[Internal Server<br/>Static: 10.10.30.10<br/>HTTP & DNS]
    end

    subgraph VLAN 99 - Management (10.10.99.0/24)
        SW1 --- |Fa0/16-24| Admin_PC[Admin Laptop<br/>Static: 10.10.99.10<br/>SSH Management]
    end
```

### 2.2 VLAN & IP Address Master Plan

| VLAN ID | VLAN Name | Subnet Range | Subnet Mask | Default Gateway | DHCP Pool | Purpose & Access Privileges |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **10** | Employee | `10.10.10.0/24` | `255.255.255.0` | `10.10.10.1` | `10.10.10.50 - .254` | Corporate wired employees. Full access to internal Server & Internet. |
| **20** | Guest | `10.10.20.0/24` | `255.255.255.0` | `10.10.20.1` | `10.10.20.50 - .254` | Visitor Wi-Fi & wired access. Internet allowed; Server & Mgmt **BLOCKED**. |
| **30** | Server | `10.10.30.0/24` | `255.255.255.0` | `10.10.30.1` | Static (`10.10.30.10`) | Enterprise Web & DNS Server. |
| **99** | Management | `10.10.99.0/24` | `255.255.255.0` | `10.10.99.1` | Static (`10.10.99.10`) | Network administration, switch SVIs, and SSH device management. |

---

## 3. Physical Cabling & Port Allocation Matrix

| Local Device | Local Interface | Remote Device | Remote Interface | Link Mode | Native VLAN | Allowed VLANs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R1-BranchRouter** | `GigabitEthernet0/0` | **SW1-CoreSwitch** | `GigabitEthernet0/1` | 802.1Q Trunk | 99 | 10, 20, 30, 99 |
| **R1-BranchRouter** | `GigabitEthernet0/1` | **ISP Cloud** | `GigabitEthernet0/0` | WAN (PAT) | N/A | N/A |
| **SW1-CoreSwitch** | `FastEthernet0/1` | **SW2-AccessSwitch** | `FastEthernet0/1` | 802.1Q Trunk | 99 | 10, 20, 30, 99 |
| **SW1-CoreSwitch** | `FastEthernet0/2-9` | **Employee PC 1** | `FastEthernet0` | Access | N/A | 10 |
| **SW1-CoreSwitch** | `FastEthernet0/10-15` | **Internal Server** | `FastEthernet0` | Access | N/A | 30 |
| **SW1-CoreSwitch** | `FastEthernet0/16-24` | **Admin Laptop** | `FastEthernet0` | Access | N/A | 99 |
| **SW2-AccessSwitch** | `FastEthernet0/2-5` | **Wireless AP / Guest PC** | `FastEthernet0` | Access | N/A | 20 |
| **SW2-AccessSwitch** | `FastEthernet0/6-10` | **Employee PC 2** | `FastEthernet0` | Access | N/A | 10 |

---

## 4. Cisco IOS Configuration Cheat-Sheet

### 4.1 Router Configuration (`R1-BranchRouter`)
- Sub-interfaces: `Gig0/0.10` (VLAN 10), `Gig0/0.20` (VLAN 20), `Gig0/0.30` (VLAN 30), `Gig0/0.99` (VLAN 99 Native).
- DHCP Pools: `EMPLOYEE_POOL`, `GUEST_POOL`, `MGMT_POOL`.
- Extended ACL `GUEST_ISOLATION_ACL`: Permits UDP DNS to `10.10.30.10`, denies access to `10.10.30.0/24` and `10.10.99.0/24`, permits outbound Internet access.
- SSH Security: VTY lines 0-15 enforced with `transport input ssh` and restricted via access-class 10 to `10.10.99.0/24`.

---

## 5. Automated Python Assurance Tool (`smartbranch_checker.py`)

The Python Assurance Tool parses machine-readable network specifications (`network_plan.yaml` / `network_plan.json`) and audits Cisco IOS `show` command outputs to validate network compliance.

### 5.1 CLI Execution Command
```bash
python smartbranch_checker.py --plan network_plan.json --config cisco_configs/sample_show_outputs/working_network.txt
```

### 5.2 Summary of Unit Test Results
```text
......
----------------------------------------------------------------------
Ran 6 tests in 0.007s

OK (100% PASS rate across healthy baseline and 5 fault scenario datasets)
```

---

## 6. 5 Injected Fault Troubleshooting Cards Summary

1. **FAULT-01 (Missing VLAN on Trunk)**: Missing VLAN 20 on SW1 Fa0/1 trunk. Fix: `switchport trunk allowed vlan add 20`.
2. **FAULT-02 (Incorrect Subnet Gateway IP)**: R1 sub-interface IP set to `.254` instead of `.1`. Fix: `ip address 10.10.10.1 255.255.255.0`.
3. **FAULT-03 (Broken DHCP Pool)**: Missing `default-router 10.10.20.1` in GUEST_POOL. Fix: `default-router 10.10.20.1`.
4. **FAULT-04 (ACL Over-blocking DNS)**: Missing permit DNS rule before deny rule. Fix: `permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain`.
5. **FAULT-05 (Missing NAT Overload)**: Missing NAT translation rule on WAN interface. Fix: `ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload`.

---

## 7. All Project Files on Your Computer

All files are located on your local disk at: `c:\Users\HP\Downloads\ajrasakha\smartbranch360\`

- 📄 **Project Summary**: [`PROJECT_SUMMARY.md`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/PROJECT_SUMMARY.md)
- 📄 **Technical Design Document**: [`docs/DESIGN_DOCUMENT.md`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/docs/DESIGN_DOCUMENT.md)
- 📄 **Requirement Plan**: [`network_plan.yaml`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/network_plan.yaml)
- 🐍 **Python Checker Tool**: [`smartbranch_checker.py`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/smartbranch_checker.py)
- ⚙️ **Cisco Router Config**: [`cisco_configs/R1_Router.cfg`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/cisco_configs/R1_Router.cfg)
- ⚙️ **Cisco SW1 Config**: [`cisco_configs/SW1_CoreSwitch.cfg`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/cisco_configs/SW1_CoreSwitch.cfg)
- ⚙️ **Cisco SW2 Config**: [`cisco_configs/SW2_AccessSwitch.cfg`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/cisco_configs/SW2_AccessSwitch.cfg)
- 📇 **5 Fault Cards**: [`docs/FAULT_CARDS.md`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/docs/FAULT_CARDS.md)
- 🎬 **Demo Recording Script**: [`docs/DEMO_SCRIPT.md`](file:///c:/Users/HP/Downloads/ajrasakha/smartbranch360/docs/DEMO_SCRIPT.md)
