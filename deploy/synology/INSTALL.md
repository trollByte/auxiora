# Auxiora on Synology NAS

## Prerequisites

- Synology NAS with DSM 7.0+
- Container Manager (Docker) package installed
- SSH access enabled (for docker compose)

## Installation

### Option A: Container Manager UI

1. Open **Container Manager** > **Project**
2. Click **Create**
3. Set project name to `auxiora`
4. Upload or paste the `docker-compose.yml` from this directory
5. Set environment variables as needed
6. Click **Build** and then **Start**

### Option B: SSH

```bash
# Connect via SSH
ssh admin@your-nas-ip

# Create directory
sudo mkdir -p /volume1/docker/auxiora
cd /volume1/docker/auxiora

# Copy docker-compose.yml to this directory, then:
sudo docker compose up -d
```

## Configuration

Set AI provider API keys as environment variables in the Container Manager
or create a `.env` file alongside the compose file:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

## Access

Open `http://your-nas-ip:18800` in your browser.

## Data

All data is stored at `/volume1/docker/auxiora/data` on the NAS.

## Updating

```bash
sudo docker compose pull
sudo docker compose up -d
```
