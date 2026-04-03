# GroupMe Bot — Open WebUI RAG Integration

A GroupMe webhook server that forwards `!ask` messages to an Open WebUI instance and posts the AI responses back to the group.

## How it works

1. GroupMe delivers a POST request to `/webhook` for every message in the group.
2. The bot ignores messages that aren't prefixed with `!ask` and ignores messages sent by bots.
3. The stripped query (plus per-group conversation history) is sent to Open WebUI's OpenAI-compatible API.
4. The AI response is posted back to the GroupMe group via the Bot API.

Conversation history is kept in memory (last 10 turns per group) and is reset if the process restarts.

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd groupme-bot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Description |
|---|---|
| `GROUPME_BOT_ID` | Your GroupMe bot ID (from dev.groupme.com) |
| `OPENWEBUI_URL` | Base URL of your Open WebUI instance |
| `OPENWEBUI_API_KEY` | API key / JWT from Open WebUI |
| `OPENWEBUI_MODEL` | Model ID to use (e.g. `gpt-4.1-mini`) |
| `PORT` | Port for the webhook server (default: `3001`) |

### 3. Create a GroupMe bot

1. Go to [dev.groupme.com](https://dev.groupme.com) and sign in.
2. Click **Bots → Create Bot**.
3. Select the group, give the bot a name, and set the **Callback URL** to:
   ```
   https://your-vps-domain.com/webhook
   ```
4. Copy the **Bot ID** into your `.env`.

### 4. Run locally

```bash
npm start
```

Use a tool like [ngrok](https://ngrok.com) to expose the local port for testing:

```bash
ngrok http 3001
```

Then update the GroupMe bot's callback URL to the ngrok URL.

---

## Deploying to a Linux VPS with PM2

### Install Node.js and PM2

```bash
# Install Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

### Deploy the app

```bash
# Copy files to the server (from your local machine)
scp -r ./groupme-bot user@your-vps-ip:/home/user/groupme-bot

# SSH into the server
ssh user@your-vps-ip

# Install dependencies
cd groupme-bot
npm install --omit=dev

# Start with PM2
pm2 start server.js --name groupme-bot

# Save the process list so it restarts on reboot
pm2 save
pm2 startup   # follow the printed command to enable the systemd service
```

### Useful PM2 commands

```bash
pm2 status              # show running processes
pm2 logs groupme-bot    # tail logs
pm2 restart groupme-bot # restart after config changes
pm2 stop groupme-bot    # stop the bot
pm2 delete groupme-bot  # remove from PM2
```

### Reverse proxy with Nginx (recommended)

Install Nginx and create a site config so GroupMe can reach port 80/443:

```nginx
server {
    listen 80;
    server_name your-vps-domain.com;

    location /webhook {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then obtain a TLS cert with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-vps-domain.com
```

GroupMe requires an **https** callback URL for production bots.

## Usage

Send a message in the GroupMe group:

```
!ask What is the school's attendance policy?
```

The bot will reply with the AI-generated answer, drawing from any knowledge base configured in your Open WebUI instance.
