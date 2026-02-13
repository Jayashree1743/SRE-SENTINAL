"""
Component B: The Brain (Python AI Step)

AI-powered Root Cause Analysis using OpenRouter LLM

Features showcased:
- Python async/await
- LLM integration (OpenRouter)
- JSON Schema validation
- State management
- Event chaining
- Polyglot architecture (Python + TypeScript)
"""

import sys
import os

# Add python_modules to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
python_modules_path = os.path.join(project_root, "python_modules")
if python_modules_path not in sys.path:
    sys.path.insert(0, python_modules_path)

# Add local ai directory for project modules
ai_dir = os.path.dirname(__file__)
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from openrouter_client import get_openrouter_client
from datetime import datetime

# Configuration
config = {
    "name": "RootCauseAnalysis",
    "type": "event",
    "description": "AI-powered root cause analysis using LLM",
    "subscribes": ["alert.detected"],
    "emits": ["rca.completed"],
    "input": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "alertType": {"type": "string"},
            "severity": {"type": "string"},
            "timestamp": {"type": "string"},
            "metric": {"type": "string"},
            "currentValue": {"type": "number"},
            "threshold": {"type": "number"},
            "affectedResource": {"type": "string"},
            "logs": {
                "type": "array",
                "items": {"type": "string"}
            },
            "metadata": {"type": "object"}
        },
        "required": ["id", "alertType", "severity", "metric", "currentValue", "threshold", "affectedResource"]
    },
    "flows": ["sentinal-sre"]
}


async def handler(alert, context):
    """
    Process alert and generate AI-powered root cause analysis

    Args:
        alert: Alert data from monitoring
        context: Motia context (emit, logger, state, trace_id)
    """

    context.logger.info("🧠 AI Brain: Starting root cause analysis", {
        "alertId": alert["id"],
        "alertType": alert["alertType"],
        "severity": alert["severity"]
    })

    try:
        # Extract alert data
        alert_id = alert["id"]
        alert_type = alert["alertType"]
        severity = alert["severity"]
        metric = alert["metric"]
        current_value = alert["currentValue"]
        threshold = alert["threshold"]
        affected_resource = alert["affectedResource"]
        logs = alert.get("logs", [])
        metadata = alert.get("metadata", {})

        # Get OpenRouter client
        client = get_openrouter_client()

        context.logger.info("Calling LLM for analysis", {
            "alertType": alert_type,
            "model": client.default_model
        })

        # Call LLM for analysis
        analysis = await client.analyze_alert(
            alert_type=alert_type,
            severity=severity,
            metric=metric,
            current_value=current_value,
            threshold=threshold,
            affected_resource=affected_resource,
            logs=logs,
            metadata=metadata
        )

        context.logger.info("✅ LLM analysis completed", {
            "summary": analysis["summary"][:100] + "...",
            "riskLevel": analysis["risk_level"]
        })

        # Create RCA result with comprehensive metadata
        # Include alert metadata for downstream steps (e.g., interactive Slack)
        rca_result = {
            "incidentId": alert_id,
            "summary": analysis["summary"],
            "rootCause": analysis["root_cause"],
            "proposedFix": analysis["proposed_fix"],
            "riskLevel": analysis["risk_level"],
            "estimatedImpact": analysis["estimated_impact"],
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "alertType": alert_type,
                "severity": severity,
                "rawLLMResponse": analysis.get("raw_response", ""),
                # Pass through alert metadata (includes diskUsagePercent for disk alerts)
                **metadata
            }
        }

        # Store RCA result in state
        await context.state.set("rca-results", alert_id, rca_result)

        context.logger.info("RCA result stored in state", {
            "incidentId": alert_id,
            "riskLevel": analysis["risk_level"]
        })

        # Emit to next step (policy engine)
        await context.emit({
            "topic": "rca.completed",
            "data": rca_result
        })

        context.logger.info("🚀 RCA completed and emitted to policy engine", {
            "incidentId": alert_id,
            "nextStep": "PolicyEngineSafetyCheck"
        })

    except Exception as error:
        context.logger.error("❌ RCA failed", {
            "alertId": alert.get("id"),
            "error": str(error),
            "errorType": type(error).__name__
        })

        # Store failure in state
        await context.state.set("rca-failures", alert["id"], {
            "alertId": alert["id"],
            "error": str(error),
            "timestamp": datetime.now().isoformat()
        })

        # Re-raise to trigger retry mechanism
        raise
