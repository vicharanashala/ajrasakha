#!/bin/bash

# Create tmux session for Dhenu2 model
tmux new-session -d -s dhenu2 "
source /home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate
python /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/dhenu/run_dhenu_server.py"

# Create tmux session for Aksara model
tmux new-session -d -s aksara "
source /home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate
CUDA_VISIBLE_DEVICES=0 vllm serve cropinailab/aksara_v1 \
  --port 8061 \
  --gpu-memory-utilization 0.2 \
  --dtype bfloat16 \
  --trust-remote-code"

# Create tmux session for FastAPI server
tmux new-session -d -s fastapi "
CUDA_VISIBLE_DEVICES=0 
source /home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate
python /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/agri_param/run_fastapi_server.py"

#start interface
tmux new-session -d -s interface "
source /home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate
python /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/serve.py"

#start ngrok
tmux new-session -d -s ngrok "
bash /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/start_ngrok.sh"

#start nginx
cd /home/aic_u2/Shubhankar/Pop && bash /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/start_nginx.sh


# Print active sessions for confirmation
tmux ls
echo "✅ All three servers are running in separate tmux sessions:"
echo "   - dhenu2"
echo "   - aksara"
echo "   - fastapi"
echo "   - interface"
echo ""
echo "To attach to any session, use: tmux attach -t <session_name>"
