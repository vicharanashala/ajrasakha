# 🚀 ACE Reviewer System — Locust Load & SLA Testing Suite

This repository contains the load testing suite for **Project 7: Reviewer System Load and SLA Testing**. It simulates high-concurrency workloads on the Reviewer System backend (`desk.vicharanashala.ai` / Node.js API), verifying SLA thresholds under peak traffic.

---

## 📋 Overview & Workload Simulation

The load testing suite simulates:
- **50 Agricultural Expert Users (`ReviewerExpertUser`)**: Logging in simultaneously, pulling assigned question queues, submitting answer reviews.
- **10 Moderator Users (`ModeratorUser`)**: Monitoring unassigned question backlogs and executing question allocations.
- **SLA Metrics Asserted**:
  - `POST /auth/login`: 95th Percentile ≤ **500ms**
  - `POST /answers/submit`: 95th Percentile ≤ **1000ms**
  - Question Allocation Cron Pipeline: Allocation SLA ≤ **30 seconds**

---

## 🛠️ Installation

```bash
# 1. Navigate to the load_tests directory
cd load_tests

# 2. Install Python dependencies
pip install -r requirements.txt
```

---

## 💻 Local Execution

### Interactive Web UI Mode
Run Locust with interactive browser charts at `http://localhost:8089`:

```bash
locust -f locustfile.py --host=http://localhost:3000
```

### Headless CLI Mode (CI Simulation)
Run an automated 1-minute load test and generate HTML & CSV reports:

```bash
mkdir -p reports
locust -f locustfile.py --headless -u 50 -r 10 --run-time 1m --host=http://localhost:3000 --csv=reports/report --html=reports/report.html
```

---

## 📊 Verifying SLAs

Run `sla_checker.py` to evaluate the generated Locust CSV statistics against SLA thresholds:

```bash
python sla_checker.py reports/report_stats.csv
```

- **Returns Status Code `0`**: All endpoints met SLA targets.
- **Returns Status Code `1`**: One or more endpoints breached SLA limits (fails CI pipeline).

---

## ⚙️ Configuration

Edit `config.py` to change target endpoints, user counts, or SLA threshold values:

```python
BASE_URL = "http://localhost:3000"
NUM_EXPERT_USERS = 50
NUM_MODERATOR_USERS = 10
SLA_LOGIN_MS = 500
SLA_ANSWER_SUBMIT_MS = 1000
SLA_ALLOCATION_SEC = 30
```
