# MCP Servers Systemd Service Files

This directory contains systemd service files for all MCP servers.

## MCP Servers

| Service Name | Script | Port | Description |
|-------------|--------|------|-------------|
| mcp-server | server.py | 9000 | Main MCP Server |
| mcp-gd | gd.py | 9001 | Golden Dataset Server |
| mcp-pop | pop.py | 9002 | Package of Practices Server |
| mcp-market | market.py | 9003 | Market Data Server |
| mcp-weather | weather.py | 9004 | Weather Data Server |
| mcp-faq | faq.py | 9005 | FAQ Server |

## Installation

### 1. Copy service files to systemd directory

```bash
sudo cp systemd/*.service /etc/systemd/system/
```

### 2. Reload systemd daemon

```bash
sudo systemctl daemon-reload
```

### 3. Enable services to start on boot

```bash
# Enable all services
sudo systemctl enable mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq

# Or enable individually
sudo systemctl enable mcp-server
sudo systemctl enable mcp-gd
sudo systemctl enable mcp-pop
sudo systemctl enable mcp-market
sudo systemctl enable mcp-weather
sudo systemctl enable mcp-faq
```

### 4. Start services

```bash
# Start all services
sudo systemctl start mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq

# Or start individually
sudo systemctl start mcp-server
sudo systemctl start mcp-gd
sudo systemctl start mcp-pop
sudo systemctl start mcp-market
sudo systemctl start mcp-weather
sudo systemctl start mcp-faq
```

## Management Commands

### Check status of all services

```bash
sudo systemctl status mcp-server
sudo systemctl status mcp-gd
sudo systemctl status mcp-pop
sudo systemctl status mcp-market
sudo systemctl status mcp-weather
sudo systemctl status mcp-faq
```

### View logs

```bash
# View logs for a specific service
sudo journalctl -u mcp-server -f
sudo journalctl -u mcp-gd -f
sudo journalctl -u mcp-pop -f
sudo journalctl -u mcp-market -f
sudo journalctl -u mcp-weather -f
sudo journalctl -u mcp-faq -f

# View logs from all MCP services
sudo journalctl -u 'mcp-*' -f
```

### Stop services

```bash
# Stop all services
sudo systemctl stop mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq

# Or stop individually
sudo systemctl stop mcp-server
```

### Restart services

```bash
# Restart all services
sudo systemctl restart mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq

# Or restart individually
sudo systemctl restart mcp-server
```

### Disable services from starting on boot

```bash
# Disable all services
sudo systemctl disable mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq
```

## Prerequisites

Before starting the services, ensure:

1. **Environment file exists**: Create `.env` file in the mcp directory based on `.env.example`
2. **MongoDB is running**: Services depend on MongoDB being available
3. **Python dependencies installed**: Install using `poetry install` or `pip install -r requirements.txt`
4. **User permissions**: The services run as user `ubuntu` (change in service files if needed)

## Troubleshooting

### Service fails to start

1. Check service status:
   ```bash
   sudo systemctl status mcp-server
   ```

2. Check logs:
   ```bash
   sudo journalctl -u mcp-server -n 50
   ```

3. Verify environment file:
   ```bash
   cat /home/ubuntu/Kshitij/sysd/ajrasakha/mcp/.env
   ```

4. Test script manually:
   ```bash
   cd /home/ubuntu/Kshitij/sysd/ajrasakha/mcp
   python3 server.py
   ```

### Port conflicts

If a port is already in use, check with:
```bash
sudo netstat -tlnp | grep :9000
```

## Configuration

The service files are configured with:
- **Auto-restart**: Services automatically restart on failure
- **Restart delay**: 10 seconds between restart attempts
- **Logging**: All output goes to systemd journal
- **Resource limits**: File descriptor limit set to 65536
- **Dependencies**: Wait for network and MongoDB to be available

## Updating Service Files

After modifying any service file:

```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart mcp-server  # restart the specific service
```
