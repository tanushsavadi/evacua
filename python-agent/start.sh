#!/bin/bash

# Fetch.ai Wildfire Monitor Agent Startup Script

echo "=========================================="
echo "🤖 Starting Fetch.ai Agent"
echo "=========================================="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -q -r requirements.txt

# Set environment variables if not set
export NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}

echo ""
echo "✅ Setup complete!"
echo "📡 Using API URL: $NEXT_PUBLIC_APP_URL"
echo "🚀 Starting agent..."
echo ""

# Run the agent
python fire_monitor_agent.py

