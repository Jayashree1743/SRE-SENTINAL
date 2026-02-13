#!/bin/bash

# OpenTelemetry Observability Stack Quick Start
# Starts Jaeger and Grafana for distributed tracing and metrics

echo "🔭 Starting OpenTelemetry Observability Stack..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start observability services
echo "📊 Starting Jaeger (tracing) and Grafana (dashboards)..."
docker compose -f docker-compose.observability.yml up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check services
echo ""
echo "🔍 Checking services..."
echo ""

if docker ps | grep -q sentinal-jaeger; then
    echo "✅ Jaeger running"
    echo "   → UI: http://localhost:16686"
    echo "   → Collector: http://localhost:14268"
else
    echo "❌ Jaeger failed to start"
fi

if docker ps | grep -q sentinal-grafana; then
    echo "✅ Grafana running"
    echo "   → UI: http://localhost:3001 (admin/admin)"
else
    echo "❌ Grafana failed to start"
fi

echo ""
echo "🎉 Observability stack is ready!"
echo ""
echo "Next steps:"
echo "1. Start Sentinal: npm run dev"
echo "2. Trigger an incident to generate traces"
echo "3. View traces in Jaeger: http://localhost:16686"
echo "4. View metrics: http://localhost:9464/metrics"
echo "5. Create Grafana dashboards: http://localhost:3001"
echo ""
echo "📖 Full guide: See OPENTELEMETRY-GUIDE.md"
echo ""
