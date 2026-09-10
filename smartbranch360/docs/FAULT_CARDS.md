# SmartBranch 360 - Troubleshooting Fault Cards
**Cisco Virtual Internship 2026 | Project 1**

This document contains 5 distinct injected fault scenarios used to practice network troubleshooting, demonstrate root cause diagnosis, validate the Python assurance tool, and confirm resolution.

---

## Fault Card 1: Missing VLAN on Switch Trunk

| Attribute | Details |
| :--- | :--- |
| **Fault ID** | FAULT-01 |
| **Component** | Switch Trunking (`SW1` - `SW2` Inter-switch link) |
| **Injected Action** | Removed VLAN 20 from allowed trunk list on SW1 port FastEthernet0/1 (`switchport trunk allowed vlan 10,30,99`). |
| **Symptom** | Wireless and wired Guest PCs connected to SW2 fail to acquire DHCP leases and cannot access the Internet or default gateway. |
| **Root Cause Analysis** | SW1 Fa0/1 trunk port drops 802.1Q tagged frames for VLAN 20 before reaching router R1. |

### Python Tool Output Evidence
```text
[FAIL] VLAN [20] Missing on Trunk SW1-FastEthernet0/1
   Symptom      : Traffic for VLAN(s) [20] dropped across trunk link SW1-FastEthernet0/1. Endpoints lose reachability.
   Root Cause   : Trunk port FastEthernet0/1 allowed list is '[10, 30, 99]', omitting required VLAN(s) [20].
   Suggested Cisco IOS Fix:
     interface FastEthernet0/1
      switchport trunk allowed vlan add 20
```

### Manual CLI Fix Commands
```cisco
SW1-CoreSwitch# configure terminal
SW1-CoreSwitch(config)# interface FastEthernet0/1
SW1-CoreSwitch(config-if)# switchport trunk allowed vlan add 20
SW1-CoreSwitch(config-if)# end
SW1-CoreSwitch# write memory
```

### Verification Steps
- Run `show interfaces trunk` on SW1 -> Confirm VLAN 20 is listed under allowed VLANs.
- In Packet Tracer on Guest PC -> Click **IP Configuration**, toggle static to DHCP -> Gets IP `10.10.20.50`.
- Ping `10.10.20.1` and `8.8.8.8` from Guest PC -> **SUCCESS**.

---

## Fault Card 2: Incorrect Sub-Interface Gateway IP Address

| Attribute | Details |
| :--- | :--- |
| **Fault ID** | FAULT-02 |
| **Component** | Inter-VLAN Router Sub-interface (`R1` `GigabitEthernet0/0.10`) |
| **Injected Action** | Configured `ip address 10.10.10.254 255.255.255.0` on `GigabitEthernet0/0.10` instead of `10.10.10.1`. |
| **Symptom** | Employee PCs on VLAN 10 fail to reach the server (10.10.30.10) or Internet. Pings to gateway `10.10.10.1` time out. |
| **Root Cause Analysis** | Sub-interface IP address mismatch between router configuration (`10.10.10.254`) and standard gateway specification (`10.10.10.1`). |

### Python Tool Output Evidence
```text
[FAIL] Incorrect Gateway IP on Sub-interface GigabitEthernet0/0.10
   Symptom      : Endpoints on VLAN 10 (Employee) fail to ping their default gateway (10.10.10.1).
   Root Cause   : Sub-interface GigabitEthernet0/0.10 is configured with IP 10.10.10.254, but requirement specifies 10.10.10.1.
   Suggested Cisco IOS Fix:
     interface GigabitEthernet0/0.10
      ip address 10.10.10.1 255.255.255.0
```

### Manual CLI Fix Commands
```cisco
R1-BranchRouter# configure terminal
R1-BranchRouter(config)# interface GigabitEthernet0/0.10
R1-BranchRouter(config-if)# ip address 10.10.10.1 255.255.255.0
R1-BranchRouter(config-if)# end
R1-BranchRouter# write memory
```

### Verification Steps
- Run `show ip interface brief` on R1 -> Verify `GigabitEthernet0/0.10` shows `10.10.10.1`.
- From Employee PC command prompt -> Run `ping 10.10.10.1` -> **SUCCESS**.
- Run `ping 10.10.30.10` (Internal Server) -> **SUCCESS**.

---

## Fault Card 3: Broken DHCP Server Pool Configuration

| Attribute | Details |
| :--- | :--- |
| **Fault ID** | FAULT-03 |
| **Component** | Router DHCP Service (`R1` `GUEST_POOL`) |
| **Injected Action** | Omitted `default-router 10.10.20.1` from `ip dhcp pool GUEST_POOL`. |
| **Symptom** | Guest Wi-Fi clients receive an IP address (`10.10.20.50`) and DNS server, but Default Gateway field remains blank (`0.0.0.0`). Guests cannot reach Internet. |
| **Root Cause Analysis** | DHCP option 3 (Default Router) missing from router DHCP server pool definition. |

### Python Tool Output Evidence
```text
[FAIL] DHCP Pool 'GUEST_POOL' Missing/Incorrect Default Gateway
   Symptom      : DHCP clients receive IP but cannot reach default gateway or Internet.
   Root Cause   : DHCP pool 'GUEST_POOL' default-router is 'None', expected '10.10.20.1'.
   Suggested Cisco IOS Fix:
     ip dhcp pool GUEST_POOL
      default-router 10.10.20.1
```

### Manual CLI Fix Commands
```cisco
R1-BranchRouter# configure terminal
R1-BranchRouter(config)# ip dhcp pool GUEST_POOL
R1-BranchRouter(dhcp-config)# default-router 10.10.20.1
R1-BranchRouter(dhcp-config)# end
R1-BranchRouter# write memory
```

### Verification Steps
- On Guest Laptop in Packet Tracer -> Click **IP Configuration**, click **Static** then **DHCP** -> Confirm Default Gateway fills with `10.10.20.1`.
- Run `ping 8.8.8.8` from Guest Laptop -> **SUCCESS**.

---

## Fault Card 4: Extended ACL Over-blocking DNS Traffic

| Attribute | Details |
| :--- | :--- |
| **Fault ID** | FAULT-04 |
| **Component** | Firewall / Security ACL (`R1` `GUEST_ISOLATION_ACL`) |
| **Injected Action** | Removed `permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain` statement from ACL, leaving `deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255` at top. |
| **Symptom** | Guest PCs can ping public IP `8.8.8.8`, but web browsing to domain names (e.g. `http://cisco.local`) fails due to DNS lookup failure. |
| **Root Cause Analysis** | Extended ACL evaluates top-down; denying all traffic to Server VLAN 30 blocks DNS port 53 before permit rule is evaluated. |

### Python Tool Output Evidence
```text
[FAIL] Guest ACL 'GUEST_ISOLATION_ACL' Blocks DNS Resolution
   Symptom      : Guest users fail to resolve domain names (DNS failure) when using internal DNS server 10.10.30.10.
   Root Cause   : ACL is missing 'permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain' prior to the deny rule.
   Suggested Cisco IOS Fix:
     ip access-list extended GUEST_ISOLATION_ACL
      permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain
```

### Manual CLI Fix Commands
```cisco
R1-BranchRouter# configure terminal
R1-BranchRouter(config)# ip access-list extended GUEST_ISOLATION_ACL
R1-BranchRouter(config-ext-nacl)# 5 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq domain
R1-BranchRouter(config-ext-nacl)# end
R1-BranchRouter# write memory
```

### Verification Steps
- Run `show ip access-lists GUEST_ISOLATION_ACL` -> Verify line 5 permits UDP domain traffic.
- Open Web Browser on Guest PC -> Enter `http://cisco.local` or run `nslookup cisco.local` -> **SUCCESS**.

---

## Fault Card 5: Missing NAT Overload Statement on Router

| Attribute | Details |
| :--- | :--- |
| **Fault ID** | FAULT-05 |
| **Component** | WAN Gateway NAT/PAT Service (`R1`) |
| **Injected Action** | Removed `ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload` statement from R1. |
| **Symptom** | All internal hosts (Employee, Guest, Server, Admin) can ping default gateway `10.10.x.1`, but cannot reach WAN/Internet IP `203.0.113.1` or `8.8.8.8`. |
| **Root Cause Analysis** | Private RFC 1918 IP packets sent to ISP are unroutable on public Internet because NAT address translation is inactive on `GigabitEthernet0/1`. |

### Python Tool Output Evidence
```text
[FAIL] Missing NAT Overload Configuration on R1
   Symptom      : Internal endpoints (10.10.x.x) fail to access Internet resources (8.8.8.8).
   Root Cause   : Missing 'ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload' statement on R1.
   Suggested Cisco IOS Fix:
     ip access-list standard NAT_ACL
      permit 10.10.0.0 0.0.255.255
     exit
     ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload
```

### Manual CLI Fix Commands
```cisco
R1-BranchRouter# configure terminal
R1-BranchRouter(config)# ip access-list standard NAT_ACL
R1-BranchRouter(config-std-nacl)# permit 10.10.0.0 0.0.255.255
R1-BranchRouter(config-std-nacl)# exit
R1-BranchRouter(config)# ip nat inside source list NAT_ACL interface GigabitEthernet0/1 overload
R1-BranchRouter(config)# end
R1-BranchRouter# write memory
```

### Verification Steps
- Run `show ip nat translations` on R1 -> Confirm translations populate when endpoints generate traffic.
- Run `ping 8.8.8.8` from Employee PC and Guest PC -> **SUCCESS**.
