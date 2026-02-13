#!/bin/bash

# Prometheus Quick Start Script for Sentinal SRE Agent

echo "🚀 Starting Prometheus Monitoring Stack..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start the Prometheus stack
echo "📊 Starting Prometheus + node-exporter + cAdvisor..."
docker compose -f docker-compose.prometheus.yml up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check if services are running
echo ""
echo "🔍 Checking services..."
echo ""

if docker ps | grep -q sentinal-prometheus; then
    echo "✅ Prometheus running on http://localhost:9090"
else
    echo "❌ Prometheus failed to start"
fi

if docker ps | grep -q sentinal-node-exporter; then
    echo "✅ Node Exporter running on http://localhost:9100"
else
    echo "❌ Node Exporter failed to start"
fi

if docker ps | grep -q sentinal-cadvisor; then
    echo "✅ cAdvisor running on http://localhost:8080"
else
    echo "❌ cAdvisor failed to start"
fi

echo ""
echo "🎉 Prometheus stack is ready!"
echo ""
echo "Next steps:"
echo "1. Open Prometheus UI: http://localhost:9090"
echo "2. Try a query: node_memory_MemAvailable_bytes"
echo "3. Start Sentinal: npm run dev"
echo "4. Check logs for: 'Prometheus (REAL)' to confirm integration"
echo ""
echo "📖 Full guide: See PROMETHEUS-SETUP.md"
echo ""
