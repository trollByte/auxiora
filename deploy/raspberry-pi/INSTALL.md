# Auxiora on Raspberry Pi

## Prerequisites

- Raspberry Pi 4 or 5 (4GB+ RAM recommended)
- 64-bit OS (Raspberry Pi OS Lite 64-bit or Ubuntu Server 24.04 ARM64)
- Docker and Docker Compose installed

## Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

## Deploy Auxiora

```bash
mkdir -p ~/auxiora && cd ~/auxiora

# Download the compose file
curl -fsSL https://raw.githubusercontent.com/auxiora/auxiora/main/deploy/raspberry-pi/docker-compose.yml -o docker-compose.yml

# Create environment file with your API keys
cat > .env << 'EOF'
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
EOF

# Start
docker compose up -d
```

## Access

Open `http://<pi-ip>:18800` in your browser.

## Performance Notes

- The compose file limits memory to 512MB and reduces Node.js heap to 256MB
- Health checks run every 60s (instead of 30s) to reduce CPU usage
- For Pi 4 with 2GB RAM, consider reducing the memory limit to 384MB
- The container uses the `latest` tag which includes ARM64 multi-arch support

## Updating

```bash
cd ~/auxiora
docker compose pull
docker compose up -d
```

## Troubleshooting

Check logs:
```bash
docker compose logs -f auxiora
```

If the container is OOM-killed, increase the memory limit in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 768M
```
