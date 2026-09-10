# SmartBranch 360 - Technical Design Document
**Cisco Virtual Internship 2026 | Project 1**
**Site Name**: SmartBranch360 (Site Code: SB-360)

---

## 1. Executive Summary & Architecture Overview

SmartBranch 360 is a secure, enterprise-grade branch office network architecture built using Cisco IOS routing and switching principles in Cisco Packet Tracer. The network supports four segregated logical segments (VLANs) providing secure connectivity for employees, isolated access for guests, centralized internal server hosting, and hardened out-of-band management access.

Key Network Capabilities:
- **Router-on-a-Stick Inter-VLAN Routing**: Sub-interface 802.1Q trunking on branch router `R1`.
- **Dynamic IP Allocation**: Automated DHCP address assignment per VLAN.
- **Internet Edge Access**: Dynamic PAT (Port Address Translation) overload on WAN link.
- **Zero-Trust Security Boundary**: Extended Access Control Lists (ACLs) enforcing Guest isolation.
- **Administrative Hardening**: Encrypted SSH management restricted strictly to Management VLAN 99.

---

## 2. Topology Diagram

### 2.1 Logical Architecture (Mermaid Diagram)

```mermaid
graph TD
    Cloud[Internet / ISP Cloud<br/>203.0.113.1/30] <-->|WAN Link| R1[Branch Router R1<br/>Gig0/1: 203.0.113.2/30]
    
    subgraph LAN Infrastructure
        R1 <-->|Trunk 802.1Q<br/>VLANs 10,20,30,99| SW1[SW1 Core/Distribution Switch<br/>SVI: 10.10.99.2/24]
        SW1 <-->|Trunk Fa0/1<br/>VLANs 10,20,30,99| SW2[SW2 Access Switch<br/>SVI: 10.10.99.3/24]
    end

    subgraph VLAN 10 - Employee (10.10.10.0/24)
        SW1 --- |Fa0/2| PC_Emp1[Employee PC 1<br/>10.10.10.50]
        SW2 --- |Fa0/5| PC_Emp2[Employee PC 2<br/>10.10.10.51]
    end

    subgraph VLAN 20 - Guest (10.10.20.0/24)
        SW2 --- |Fa0/2| WAP[Wireless AP<br/>Guest Wi-Fi]
        WAP -.- Guest_Laptop[Guest Wireless Laptop<br/>10.10.20.50]
        SW2 --- |Fa0/3| Guest_PC[Guest Wired PC<br/>10.10.20.51]
    end

    subgraph VLAN 30 - Server (10.10.30.0/24)
        SW1 --- |Fa0/10| Server[Internal Server<br/>10.10.30.10<br/>HTTP & DNS]
    end

    subgraph VLAN 99 - Management (10.10.99.0/24)
        SW1 --- |Fa0/99| Admin_PC[Admin Management PC<br/>10.10.99.10<br/>SSH Only]
    end
```

---

## 3. VLAN & IP Address Plan

| VLAN ID | VLAN Name | Subnet Range | Subnet Mask | Default Gateway | DHCP Pool | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **10** | Employee | `10.10.10.0/24` | `255.255.255.0` | `10.10.10.1` | `10.10.10.50 - .254` | Wired employee workstations & workstations |
| **20** | Guest | `10.10.20.0/24` | `255.255.255.0` | `10.10.20.1` | `10.10.20.50 - .254` | Visitor Wi-Fi and temporary wired access |
| **30** | Server | `10.10.30.0/24` | `255.255.255.0` | `10.10.30.1` | Disabled (Static) | Internal Enterprise Web & DNS Server (`10.10.30.10`) |
| **99** | Management | `10.10.99.0/24` | `255.255.255.0` | `10.10.99.1` | `10.10.99.50 - .254` | Out-of-band SSH device SVIs & Admin PC (`10.10.99.10`) |

---

## 4. Cabling & Port Allocation Table

| Local Device | Local Interface | Remote Device | Remote Interface | Link Type | Native VLAN | Allowed VLANs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R1-BranchRouter** | `GigabitEthernet0/0` | **SW1-CoreSwitch** | `GigabitEthernet0/1` | 802.1Q Trunk | 99 | 10, 20, 30, 99 |
| **R1-BranchRouter** | `GigabitEthernet0/1` | **ISP Cloud / Router** | `GigabitEthernet0/0` | WAN Link (PAT) | N/A | N/A |
| **SW1-CoreSwitch** | `FastEthernet0/1` | **SW2-AccessSwitch** | `FastEthernet0/1` | 802.1Q Trunk | 99 | 10, 20, 30, 99 |
| **SW1-CoreSwitch** | `FastEthernet0/2` | **Employee PC 1** | `FastEthernet0` | Access | N/A | 10 |
| **SW1-CoreSwitch** | `FastEthernet0/10` | **Internal Server** | `FastEthernet0` | Access | N/A | 30 |
| **SW1-CoreSwitch** | `FastEthernet0/99` | **Admin Laptop** | `FastEthernet0` | Access | N/A | 99 |
| **SW2-AccessSwitch** | `FastEthernet0/2` | **Wireless AP (WAP)** | `Port 0` | Access | N/A | 20 |
| **SW2-AccessSwitch** | `FastEthernet0/3` | **Guest PC 1** | `FastEthernet0` | Access | N/A | 20 |
| **SW2-AccessSwitch** | `FastEthernet0/5` | **Employee PC 2** | `FastEthernet0` | Access | N/A | 10 |

---

## 5. Security & Access Control Policy Matrix

### 5.1 Guest Isolation ACL Matrix

| Source Subnet | Destination | Protocol / Port | Action | Policy Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **VLAN 20 (Guest)** | `10.10.30.10` | UDP 53 (DNS) | **PERMIT** | Allow domain name resolution for Web access |
| **VLAN 20 (Guest)** | `10.10.30.0/24` | ALL IP Traffic | **DENY** | Block Guest users from accessing company internal servers |
| **VLAN 20 (Guest)** | `10.10.99.0/24` | ALL IP Traffic | **DENY** | Block Guest users from reaching network infrastructure SVIs |
| **VLAN 20 (Guest)** | `0.0.0.0/0 (Internet)` | ALL IP Traffic | **PERMIT** | Permit outbound web/internet access |

### 5.2 Device SSH Management Hardening

- **Transport Protocol**: SSH Version 2 (`transport input ssh`). Telnet disabled.
- **Authentication**: Local database (`login local`) with privilege level 15 secret key.
- **Allowed Source**: Restricted via VTY access-class `10` to permit ONLY `10.10.99.0/24` (Management VLAN).
- **RSA Crypto Key**: 2048-bit modulus.

---

## 6. How to Build in Packet Tracer (Step-by-Step)

1. **Add Physical Devices**:
   - 1 Router (Cisco 2911 or 4331) -> Rename to `R1-BranchRouter`.
   - 2 Switches (Cisco 2960-24TT) -> Rename to `SW1-CoreSwitch` and `SW2-AccessSwitch`.
   - 1 Wireless Access Point (AP-PT) -> Connect to SW2 port Fa0/2.
   - 1 Server -> Connect to SW1 port Fa0/10 (IP `10.10.30.10`).
   - 8 Endpoints (PCs/Laptops).
2. **Apply Cisco IOS Configurations**:
   - Paste `cisco_configs/R1_Router.cfg` into Router CLI.
   - Paste `cisco_configs/SW1_CoreSwitch.cfg` into SW1 CLI.
   - Paste `cisco_configs/SW2_AccessSwitch.cfg` into SW2 CLI.
3. **Configure Endpoints**:
   - Set Employee PCs and Guest PCs to **DHCP**.
   - Set Admin Laptop to static IP `10.10.99.10` / mask `255.255.255.0` / gateway `10.10.99.1`.
   - Set Server to static IP `10.10.30.10` / mask `255.255.255.0` / gateway `10.10.30.1`. Enable HTTP and DNS services.
4. **Save Network File**:
   - Save the Packet Tracer file as `SmartBranch360.pkt`.
