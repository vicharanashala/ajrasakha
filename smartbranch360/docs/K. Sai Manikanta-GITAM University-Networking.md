# SMARTBRANCH 360: DESIGN AND AUTOMATED ASSURANCE OF A SECURE ENTERPRISE BRANCH NETWORK USING CISCO PACKET TRACER AND PYTHON

**An Internship Report submitted in partial fulfillment of the requirements for the award of the degree of**

### BACHELOR OF TECHNOLOGY
**in**
### COMPUTER SCIENCE AND ENGINEERING

**Submitted by**

**Kona Sai Manikanta (2023002625)**

**@Cisco Networking Academy**
**@Andhra Pradesh, India (Online / Virtual Internship)**

**Department of Computer Science and Systems Engineering**
**GITAM School of Computer Science and Engineering**
**GITAM (Deemed to be University)**
**Visakhapatnam**
**2026**

---

<br/>

### DEPARTMENT OF COMPUTER SCIENCE AND SYSTEMS ENGINEERING
### GITAM School of Computer Science and Engineering
### GITAM (Deemed to be University)
### Visakhapatnam

<br/>

## DECLARATION

I hereby declare that the internship report entitled **"SmartBranch 360: Design and Automated Assurance of a Secure Enterprise Branch Network Using Cisco Packet Tracer and Python"** is an original work done and submitted to the Department of Computer Science and Systems Engineering, GITAM School of CSE, GITAM (Deemed to be University) in partial fulfillment of the requirements for the award of B.Tech Degree in Computer Science and Engineering.

The work has not been submitted to any other college or University for the award of any degree or diploma.

**Date**: August 30, 2026

| Registration No | Name | Signature |
| :--- | :--- | :--- |
| **2023002625** | **Kona Sai Manikanta** | ____________________ |

---

<br/>

### DEPARTMENT OF COMPUTER SCIENCE AND SYSTEMS ENGINEERING
### GITAM School of Computer Science and Engineering
### GITAM (Deemed to be University)
### Visakhapatnam

<br/>

## CERTIFICATE

This is to certify that the internship report entitled **“SmartBranch 360: Design and Automated Assurance of a Secure Enterprise Branch Network Using Cisco Packet Tracer and Python”** is a bonafide record of work carried out by **Kona Sai Manikanta (2023002625)** at Cisco Networking Academy, Andhra Pradesh, India (Online / Virtual Internship) and submitted in partial fulfillment of requirements for the award of B.Tech Degree in Computer Science and Engineering.

**Date**: August 30, 2026

**Internship Reviewer**: ____________________  
**Head of the Department**: ____________________

---

## BASIC INFORMATION OF THE INTERNSHIP REPORT

| S.No. | Description | Details |
| :--- | :--- | :--- |
| **1.** | Regd. No. | `2023002625` |
| **2.** | Name of the Student | Kona Sai Manikanta |
| **3.** | Branch | CSE (Core) |
| **4.** | Email ID | `skona6@gitam.in` |
| **5.** | Mobile Number | `9704906829` |
| **6.** | Name of the Organisation | Cisco Networking Academy |
| **7.** | Type (Govt./Private/Educational/Training) | Multinational Technology Company |
| **8.** | Address of the Organisation | 170 West Tasman Drive, San Jose, California 95134, USA |
| **9.** | State in which you worked | Andhra Pradesh |
| **10.**| Website of the Organisation | `https://www.netacad.com` |
| **11.**| Employee Size in the Organisation | 90,000+ |
| **12.**| Contact Details of the Organisation | N/A (Online Virtual Internship Platform) |
| **13.**| Name of the Mentor from the Organisation | Cisco VIP Regional Mentor Team |
| **14.**| Email Id & Contact Number of the Mentor | N/A |
| **15.**| Internship Title | Cisco Virtual Internship Programme (Networking Track) - Project 1: SmartBranch 360 |
| **16.**| Skills or Technologies Used | Cisco Packet Tracer, VLANs, Inter-VLAN Routing, DHCP, ACLs, Python, Cisco IOS CLI |
| **17.**| Internship Mode (Physical / Online / Hybrid) | Online |
| **18.**| Type (Paid by Company/ Free/ Paid by Student) | No Payment (Free) |
| **19.**| Amount (in Rs.) | Free |
| **20.**| Internship Duration (Days) | 5th June 2026 to Present |

---

## ACCEPTANCE LETTER / OFFER LETTER

*(Attach/paste your scanned copy or screenshot of the Cisco Virtual Internship Programme allocation email received from GITAM, along with the AICTE portal registration confirmation, here.)*

---

## ABOUT THE COMPANY

Cisco Networking Academy is Cisco Systems' global IT skills and career-building program, delivered through the `netacad.com` learning platform. Headquartered at 170 West Tasman Drive, San Jose, California, USA, Cisco is a multinational technology conglomerate with over 90,000 employees worldwide, recognized as a global leader in networking hardware, software, and cybersecurity solutions.

Through Cisco Networking Academy, the organisation partners with academic institutions such as GITAM (Deemed to be University) to deliver structured, industry-aligned learning paths in networking, cybersecurity, and IT fundamentals. As part of the Cisco Virtual Internship Programme (VIP) 2026, coordinated through the AICTE portal, eligible students who complete the mandatory certification courses are subsequently allotted hands-on virtual projects based on Cisco Packet Tracer, giving learners practical, industry-relevant exposure to enterprise networking concepts without requiring physical relocation or in-person placement.

---

## INTERNSHIP CERTIFICATES

*(Attach/paste your Cisco Networking Academy course-completion certificates for Networking Essentials, Getting Started with Cisco Packet Tracer, and Exploring Networking with Cisco Packet Tracer here, along with the Project 1 SmartBranch 360 completion certificate once issued.)*

---

## GEO-TAGGED PHOTOGRAPHS

*(Attach/paste your geo-tagged photograph(s) working on your online workstation, as required by the department, here.)*

---

## ACKNOWLEDGEMENT

I would like to express my sincere gratitude to everyone who supported and guided me through the Cisco Virtual Internship Programme 2026.

I am thankful to Prof. S. Arun Kumar, Dean, GITAM School of Computer Science and Engineering (GSCSE), Visakhapatnam, and Prof. K. Thirupathi Rao, Director of the School, for providing the opportunity and environment to pursue this internship.

I extend my heartfelt thanks to Prof. G V S Raj Kumar, Head of the Department, Department of Computer Science and Systems Engineering (CSSE), for his continuous encouragement and support throughout the internship.

I am also grateful to Cisco Networking Academy and the Cisco Virtual Internship Programme (VIP) team for providing the learning resources, the Cisco Packet Tracer platform, and the opportunity to work on the SmartBranch 360 project, which greatly enhanced my practical understanding of enterprise networking.

Finally, I thank my family, friends, and faculty coordinators at GITAM for their constant motivation and support during the course of this internship.

---

## ABSTRACT

This report presents the work carried out during the Cisco Virtual Internship Programme (VIP) 2026, undertaken through Cisco Networking Academy under the Networking Track. The internship began with the completion of three mandatory certification courses — Networking Essentials, Getting Started with Cisco Packet Tracer, and Exploring Networking with Cisco Packet Tracer — which built a strong foundation in networking concepts, network devices, topologies, and simulation using Cisco Packet Tracer.

Following the certification phase, Project 1, titled “SmartBranch 360,” was allotted. The objective of the project was to design a secure enterprise branch office network using Cisco Packet Tracer, incorporating multi-VLAN segmentation, inter-VLAN routing using the router-on-a-stick technique, dynamic host configuration via DHCP, and traffic filtering through extended Access Control Lists (ACLs) to isolate guest network traffic from internal servers. In addition, a Python-based network assurance tool, `smartbranch_checker.py`, was developed to automatically audit switch and router configurations against an expected network plan, flag misconfigurations such as missing VLANs on trunk links, and recommend the exact Cisco IOS commands required to remediate them.

The network topology and its security controls were verified through structured connectivity testing and a fault-injection exercise, in which a VLAN was deliberately removed from a trunk link to simulate a real-world misconfiguration; the Python assurance tool successfully detected the fault and, after the fix was applied, confirmed a 100% pass rate across all validation rules. This internship strengthened practical skills in enterprise network design, network security, and automation through Python scripting, and is documented in detail in the sections that follow.

---

## TABLE OF CONTENTS

| S. No. | Description |
| :--- | :--- |
| **1.** | Objectives and Scope |
| **2.** | Project Description |
| **3.** | Roles and Responsibilities |
| **4.** | Technologies and Tools Used |
| **5.** | Methodology and Implementation |
| **6.** | Test Cases |
| **7.** | Results and Deliverables |
| **8.** | Skills and Learning Outcomes |
| **9.** | Conclusion & Future Scope |
| **10.**| References |

---

## 1. OBJECTIVES AND SCOPE

### 1.1 Internship Objectives
- To gain foundational and practical knowledge of computer networking through Cisco Networking Academy's certification courses.
- To develop hands-on proficiency with Cisco Packet Tracer for simulating real-world enterprise network environments.
- To apply networking concepts learned during certification to a live, industry-styled project (SmartBranch 360).
- To gain exposure to industry practices in network design, security, and automated network assurance.

### 1.2 Project Objectives
- To design and simulate a secure, multi-VLAN branch office network for an enterprise using Cisco Packet Tracer.
- To implement inter-VLAN routing using the router-on-a-stick technique on a Cisco 2911 router.
- To configure dynamic IP addressing through DHCP pools for all VLAN segments.
- To enforce network security by isolating guest traffic from internal servers using extended Access Control Lists (ACLs).
- To build a Python-based configuration assurance tool capable of automatically auditing device configurations and generating remediation commands for detected faults.

### 1.3 Scope of Work
The scope of the internship spanned two phases. The first phase (certification phase) covered the completion of three prerequisite Cisco Networking Academy courses — Networking Essentials, Getting Started with Cisco Packet Tracer, and Exploring Networking with Cisco Packet Tracer — between 31 May 2026 and 15 June 2026. The second phase (project phase) covered the design, configuration, testing, and documentation of the SmartBranch 360 network in Cisco Packet Tracer, along with development of the accompanying Python network assurance script.

---

## 2. PROJECT DESCRIPTION

### 2.1 Problem Statement
Enterprise branch offices typically host multiple categories of users and devices — corporate employees, guest visitors, internal servers, and management infrastructure — on a single physical network. Without proper segmentation and access control, this creates security risks, such as guest devices being able to reach sensitive internal servers. Additionally, diagnosing configuration faults (for example, a VLAN accidentally omitted from a trunk link) by manually inspecting CLI output across multiple devices is slow and error-prone, especially as network size grows.

### 2.2 Proposed Solution
SmartBranch 360 addresses this problem in two parts:
1. **Network Infrastructure & Security**: The network itself is logically segmented into four VLANs — Corporate Employees (VLAN 10), Visitor Guests (VLAN 20), Internal Servers (VLAN 30), and Infrastructure Management (VLAN 99) — with inter-VLAN routing handled by a router-on-a-stick configuration on Router R1, dynamic PAT for Internet access, and an extended ACL enforced to block guest-to-server traffic while still permitting normal corporate access.
2. **Automated Python Assurance**: A Python command-line tool, `smartbranch_checker.py`, was built to compare a machine-readable network plan (`network_plan.json`) against captured device "show" command output, automatically flag any rule violation (such as a missing VLAN on a trunk), explain the likely root cause, and print the exact Cisco IOS commands needed to fix it.

### 2.3 Project Overview
The project topology consists of a Cisco 2911 router (R1) connected via 802.1Q trunk links to a core switch (SW1) and an access switch (SW2), which in turn connect an internal server, a wireless access point, and multiple end-user PCs representing corporate employees and guest visitors. VLAN 10 is assigned to corporate employees, VLAN 20 to visitor guests, VLAN 30 to internal web and DNS servers, and VLAN 99 to infrastructure management. Router sub-interfaces handle inter-VLAN routing, and router-based DHCP pools automatically assign IP addresses to hosts in each VLAN.

### 2.4 Expected Outcomes
- A fully functional, segmented enterprise branch network simulated end-to-end in Cisco Packet Tracer.
- Verified security isolation between guest and internal server VLANs.
- A working Python assurance tool that can detect real configuration faults and recommend fixes automatically.
- A recorded demonstration validating both normal operation and fault-detection/remediation workflows.

---

## 3. ROLES AND RESPONSIBILITIES

### 3.1 Assigned Role
Virtual Intern — Networking Track, Cisco Virtual Internship Programme 2026, working individually on Project 1: SmartBranch 360.

### 3.2 Responsibilities
- Completing the mandatory Cisco Networking Academy certification courses within the stipulated timeline.
- Designing and building the SmartBranch 360 network topology in Cisco Packet Tracer.
- Configuring VLANs, trunking, inter-VLAN routing, DHCP, and security ACLs on the simulated devices.
- Developing and testing the Python-based network assurance script.
- Documenting the project and preparing a recorded video demonstration of the working solution.

### 3.3 Tasks Performed
- Completed Networking Essentials, Getting Started with Cisco Packet Tracer, and Exploring Networking with Cisco Packet Tracer on the Cisco Networking Academy platform.
- Built the SmartBranch 360 topology comprising a router, two switches, an access point, a server, and multiple end-user PCs.
- Configured four VLANs (10, 20, 30, 99), 802.1Q trunk links, and router-on-a-stick sub-interfaces on R1.
- Set up DHCP pools for automatic IP assignment across VLAN segments.
- Authored and applied an extended ACL on R1 to block guest VLAN traffic from reaching the internal server VLAN.
- Wrote `smartbranch_checker.py` in Python to parse a JSON network plan and device configuration/show-output text files, validate them against 13 defined rules, and report PASS/FAIL results with suggested fixes.
- Performed fault-injection testing by removing VLAN 20 from the SW1 trunk link, confirming the tool correctly detected and diagnosed the fault, then verified restoration of full connectivity and a 100% pass result after applying the fix.

---

## 4. TECHNOLOGIES AND TOOLS USED

### 4.1 Programming Languages
- **Python 3**: Used to develop the `smartbranch_checker.py` network assurance and audit script.
- **Cisco IOS Command-Line Syntax**: Used to configure routers and switches (VLANs, trunking, sub-interfaces, DHCP, ACLs).

### 4.2 Frameworks/Libraries
- **Python Standard Library**: (`re` for regex parsing, `json` for plan parsing, `argparse` for CLI arguments, `unittest` for automated test suites).

### 4.3 Software Tools
- **Cisco Packet Tracer (v8.x)**: For designing, configuring, and simulating the SmartBranch 360 network topology.
- **Windows Command Prompt (cmd)**: For running and testing the Python assurance script.
- **Windows Game Bar Screen Recorder**: For capturing the project demonstration video.

### 4.4 Platforms/Databases
- **Cisco Networking Academy (`netacad.com`)**: Learning management platform for course delivery, tracking, and certification.
- **`network_plan.json`**: A structured JSON file used as the reference "source of truth" describing intended VLAN, trunk, and addressing plans.

---

## 5. METHODOLOGY AND IMPLEMENTATION

### 5.1 System Architecture & VLAN Plan

| VLAN ID | Name | Subnet Range | Gateway | Function |
| :--- | :--- | :--- | :--- | :--- |
| **10** | Employee | `10.10.10.0/24` | `10.10.10.1` | Corporate Workstations |
| **20** | Guest | `10.10.20.0/24` | `10.10.20.1` | Visitor Wi-Fi & Wired Access |
| **30** | Server | `10.10.30.0/24` | `10.10.30.1` | Internal Server (`10.10.30.10`) |
| **99** | Management | `10.10.99.0/24` | `10.10.99.1` | Switch SVIs & Admin PC (`10.10.99.10`) |

### 5.2 Module Design
- **VLAN Segmentation Module**: Segmenting ports on SW1 and SW2 into VLANs 10, 20, 30, 99.
- **Routing Module**: Router-on-a-stick sub-interfaces on R1 providing inter-VLAN routing (`Gig0/0.10`, `Gig0/0.20`, `Gig0/0.30`, `Gig0/0.99`).
- **Addressing Module**: DHCP pools on R1 for automatic IP allocation per VLAN.
- **Security Module**: Extended Access Control List `GUEST_ISOLATION_ACL` on R1 permitting DNS lookup to `10.10.30.10` while denying general guest traffic to server VLAN 30 and management VLAN 99.
- **Assurance Module**: `smartbranch_checker.py`, evaluating device configurations against 13 validation rules.

---

## 6. TEST CASES AND EMPIRICAL RESULTS

### 6.1 Summary of Test Cases

| Test Case | Description & Steps | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-1** | **Corporate-to-Server Connectivity**: From Employee PC 1 (`10.10.10.50`), run `ping 10.10.30.10`. | Successful ICMP replies received (`Reply from 10.10.30.10`). | `Reply from 10.10.30.10: bytes=32 time=12ms TTL=127` | **PASS** |
| **TC-2** | **Guest Isolation (ACL Security)**: From Guest PC 1 (`10.10.20.50`), run `ping 10.10.30.10`. | Request times out / Destination host unreachable. | `Destination Host Unreachable / Request timed out` | **PASS** |
| **TC-3** | **Fault Detection Audit**: Remove VLAN 20 from SW1 Fa0/1 trunk link; execute `smartbranch_checker.py`. | Tool reports `[FAIL]` — VLAN 20 missing on trunk SW1-FastEthernet0/1 with suggested fix. | `[FAIL] VLAN [20] Missing on Trunk SW1-FastEthernet0/1` | **PASS** |
| **TC-4** | **Fault Remediation Verification**: Apply fix (`switchport trunk allowed vlan add 20`) and re-run tool. | Guest connectivity restored; tool reports 100% PASS across 13 rules. | `100% PASS (13/13 rules validated)` | **PASS** |

---

## 7. RESULTS AND DELIVERABLES

### 7.1 Results
The SmartBranch 360 network was successfully designed, configured, and verified in Cisco Packet Tracer. VLAN segmentation, inter-VLAN routing, DHCP-based addressing, and ACL-based security isolation all functioned as intended. The Python assurance tool, `smartbranch_checker.py`, correctly validated the configuration under normal conditions, accurately detected an intentionally injected fault, and confirmed successful remediation with a 100% pass rate across all 13 defined rules.

### 7.2 Project Deliverables
- Working Cisco Packet Tracer topology file (`SmartBranch360.pkt`).
- Device configuration scripts for R1, SW1, and SW2 (`R1_Router.cfg`, `SW1_CoreSwitch.cfg`, `SW2_AccessSwitch.cfg`).
- Python network assurance tool (`smartbranch_checker.py`) with supporting `network_plan.json` and test files.
- Recorded video demonstration covering topology walkthrough, connectivity verification, fault injection, and remediation.
- Complete internship summary report.

---

## 8. SKILLS AND LEARNING OUTCOMES

### 8.1 Technical Skills
- Practical configuration of VLANs, 802.1Q trunking, and router-on-a-stick inter-VLAN routing on Cisco devices.
- DHCP configuration for automated address allocation across network segments.
- Designing and applying extended Access Control Lists for network security and segmentation.
- Python scripting for configuration parsing, rule-based validation, and automated network assurance.
- Proficiency with Cisco Packet Tracer for enterprise network simulation and testing.

---

## 9. CONCLUSION AND FUTURE SCOPE

### 9.1 Conclusion
The Cisco Virtual Internship Programme 2026 provided valuable foundational and applied experience in enterprise networking. Through the certification phase, core networking concepts were consolidated, and through the SmartBranch 360 project, this knowledge was applied to design, secure, and validate a realistic branch-office network. The accompanying Python assurance tool demonstrated how automation can meaningfully reduce the time and effort required to diagnose network misconfigurations.

### 9.2 Future Enhancements
- Extending `smartbranch_checker.py` to connect directly to live or simulated devices via SSH/Telnet or an API.
- Adding additional validation rules covering routing protocols, port security, and STP configuration.
- Building a simple web dashboard to visualize PASS/FAIL results over time.

---

## 10. REFERENCES

### Books
1. Odom, W. (2020). *CCNA 200-301 Official Cert Guide, Volume 1*. Cisco Press.
2. Lammle, T. (2020). *Cisco Certified Network Associate (CCNA) Study Guide: Exam 200-301*. Sybex / Wiley.

### Websites & Documentation
1. Cisco Networking Academy. Available at: `https://www.netacad.com`
2. Cisco Systems, Inc. Cisco IOS Configuration Guides. Available at: `https://www.cisco.com`
3. Cisco Packet Tracer Official Documentation and Course Material — Networking Essentials, Getting Started with Cisco Packet Tracer, Exploring Networking with Cisco Packet Tracer (Cisco Networking Academy, 2026).
4. Python 3 Official Documentation. Available at: `https://docs.python.org/3/`
