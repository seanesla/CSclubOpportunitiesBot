#!/bin/bash
# Oracle Cloud Deployment Script
# Run this on your Oracle Cloud instance

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Update system
echo -e "${YELLOW}[1/8] Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (if not installed)
echo -e "${YELLOW}[2/8] Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 22.x..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# 3. Install PM2 (process manager)
echo -e "${YELLOW}[3/8] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 installed${NC}"

# 4. Clone/pull repository
echo -e "${YELLOW}[4/8] Setting up repository...${NC}"
REPO_DIR="$HOME/CSclubOpportunitiesBot"

if [ -d "$REPO_DIR" ]; then
    echo "Repository exists, pulling latest..."
    cd "$REPO_DIR"
    git pull origin main
else
    echo "Cloning repository..."
    cd "$HOME"
    git clone https://github.com/$(git config user.name || echo 'YOUR_USERNAME')/CSclubOpportunitiesBot.git
    cd "$REPO_DIR"
fi

# 5. Install dependencies
echo -e "${YELLOW}[5/8] Installing dependencies...${NC}"
npm install --production

# 6. Set up .env file
echo -e "${YELLOW}[6/8] Checking environment variables...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Please create .env file with required variables:"
    echo "  - DISCORD_TOKEN"
    echo "  - DISCORD_CLIENT_ID"
    echo "  - TURSO_DATABASE_URL"
    echo "  - TURSO_AUTH_TOKEN"
    echo "  - REALTIME_CHANNEL_ID"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# 7. Stop existing bot (if running)
echo -e "${YELLOW}[7/8] Stopping existing bot...${NC}"
pm2 stop discord-bot 2>/dev/null || echo "No existing bot to stop"
pm2 delete discord-bot 2>/dev/null || echo "No existing bot to delete"

# 8. Start bot with PM2
echo -e "${YELLOW}[8/8] Starting bot with PM2...${NC}"
pm2 start src/index.js --name discord-bot --time
pm2 save
pm2 startup | tail -n 1 | sudo bash || true  # Setup auto-restart on reboot

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Bot is now running! Use these commands:"
echo "  pm2 logs discord-bot      # View logs"
echo "  pm2 status                # Check status"
echo "  pm2 restart discord-bot   # Restart bot"
echo "  pm2 stop discord-bot      # Stop bot"
echo ""
echo "The bot will run in real-time mode automatically."
