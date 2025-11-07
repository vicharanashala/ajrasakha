# Agriculture LLM Comparison Interface

A minimal chatbot interface to compare responses from three agriculture LLMs side by side.

## Models
- **Aksara** (cropinailab/aksara_v1) - Port 8061
- **AgriParam** (bharatgenai/AgriParam) - Port 8064
- **Dhenu2** (KissanAI/Dhenu2-In-Llama3.1-8B-Instruct) - Port 8063 (MIG device)

## Usage

### 1. Start all three model servers
```bash
cd /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm
./run_all_models.sh
```

This will start:
- Aksara on port 8061
- AgriParam on port 8064
- Dhenu2 on port 8063 (using MIG device)

### 2. Start the Nginx reverse proxy
The interface uses Nginx to unify all three model servers under one port (84):

```bash
cd /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface
./start_nginx.sh
```

### 3. Access the interface
Open your browser and navigate to:
```
http://localhost:84
```

### 4. Use the chatbot
Type your agriculture-related question and press "Send" to see responses from all three models side by side!

### 5. (Optional) Expose to Internet via Ngrok
To make your chatbot accessible from the internet:

```bash
cd /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface
./start_ngrok.sh
```

This will forward port 8084 and give you a public URL to access:
- Web Interface: `<ngrok-url>/`
- All three model APIs through the single ngrok URL

## Architecture

```
                    ┌─────────────────┐
                    │  Browser (:84)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx Proxy    │
                    │    Port 84      │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     ┌────▼────┐       ┌─────▼─────┐     ┌─────▼─────┐
     │ Aksara  │       │ AgriParam │     │  Dhenu2   │
     │ :8061   │       │  :8064    │     │  :8063    │
     └─────────┘       └───────────┘     └───────────┘
```

### API Endpoints (via Nginx)
All endpoints are accessible through port 84:
- **Aksara**: `http://localhost:84/aksara/v1/chat/completions`
- **AgriParam**: `http://localhost:84/agriparam/v1/chat/completions`
- **Dhenu2**: `http://localhost:84/dhenu2/v1/chat/completions`

## Features
- ✅ Simple, clean interface
- ✅ Side-by-side model comparison
- ✅ Real-time parallel queries to all models
- ✅ Error handling for each model independently
- ✅ Responsive design
- ✅ Unified API endpoint via Nginx reverse proxy
- ✅ Single port (84) for all services

## Stopping Services

### Stop the Nginx proxy:
```bash
cd /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface
./stop_nginx.sh
```

### Stop individual model servers:
```bash
# Stop a specific model
tmux kill-session -t aksara
tmux kill-session -t agriparam
tmux kill-session -t dhenu2

# Or stop all at once
tmux kill-session -t aksara && tmux kill-session -t agriparam && tmux kill-session -t dhenu2
```

### View model server logs:
```bash
# Attach to a running model session
tmux attach -t aksara    # Press Ctrl+B then D to detach
tmux attach -t agriparam
tmux attach -t dhenu2
```

