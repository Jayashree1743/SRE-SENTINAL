import json
import os
import re
from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:  # pragma: no cover - fallback for missing optional dependency
    httpx = None


DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-r1")
DEFAULT_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
DEFAULT_TIMEOUT = float(os.getenv("OPENROUTER_TIMEOUT", "30"))

_CLIENT: Optional["OpenRouterClient"] = None


class OpenRouterClient:
    def __init__(
        self,
        api_key: Optional[str],
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key
        self.default_model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = None
        if httpx is not None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers=self._build_headers(),
            )

    def _build_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # Optional OpenRouter headers
        referer = os.getenv("OPENROUTER_HTTP_REFERER") or os.getenv("PUBLIC_URL")
        if referer:
            headers["HTTP-Referer"] = referer

        title = os.getenv("OPENROUTER_APP_TITLE") or os.getenv("APP_NAME")
        if title:
            headers["X-Title"] = title

        return headers

    async def analyze_alert(
        self,
        alert_type: str,
        severity: str,
        metric: str,
        current_value: float,
        threshold: float,
        affected_resource: str,
        logs: Optional[list] = None,
        metadata: Optional[dict] = None,
    ) -> Dict[str, Any]:
        if not self.api_key or self._client is None:
            return _heuristic_analysis(
                alert_type,
                severity,
                metric,
                current_value,
                threshold,
                affected_resource,
                logs or [],
                metadata or {},
                raw_response="",
                error=(
                    "OPENROUTER_API_KEY not set"
                    if not self.api_key
                    else "httpx not installed"
                ),
            )

        payload = _build_payload(
            alert_type=alert_type,
            severity=severity,
            metric=metric,
            current_value=current_value,
            threshold=threshold,
            affected_resource=affected_resource,
            logs=logs or [],
            metadata=metadata or {},
            model=self.default_model,
        )

        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()

            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )

            parsed = _extract_json(content)
            if not isinstance(parsed, dict):
                return _heuristic_analysis(
                    alert_type,
                    severity,
                    metric,
                    current_value,
                    threshold,
                    affected_resource,
                    logs or [],
                    metadata or {},
                    raw_response=content,
                    error="Failed to parse JSON response",
                )

            analysis = _coerce_analysis(parsed, severity)
            analysis["raw_response"] = content
            return analysis
        except Exception as exc:
            return _heuristic_analysis(
                alert_type,
                severity,
                metric,
                current_value,
                threshold,
                affected_resource,
                logs or [],
                metadata or {},
                raw_response="",
                error=str(exc),
            )


def get_openrouter_client() -> OpenRouterClient:
    global _CLIENT
    if _CLIENT is None:
        api_key = os.getenv("OPENROUTER_API_KEY")
        model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
        base_url = os.getenv("OPENROUTER_BASE_URL", DEFAULT_BASE_URL)
        timeout = float(os.getenv("OPENROUTER_TIMEOUT", str(DEFAULT_TIMEOUT)))
        _CLIENT = OpenRouterClient(
            api_key=api_key,
            model=model,
            base_url=base_url,
            timeout=timeout,
        )
    return _CLIENT


def _build_payload(
    *,
    alert_type: str,
    severity: str,
    metric: str,
    current_value: float,
    threshold: float,
    affected_resource: str,
    logs: list,
    metadata: dict,
    model: str,
) -> Dict[str, Any]:
    input_payload = {
        "alertType": alert_type,
        "severity": severity,
        "metric": metric,
        "currentValue": current_value,
        "threshold": threshold,
        "affectedResource": affected_resource,
        "logs": logs,
        "metadata": metadata,
    }

    system_prompt = (
        "You are an SRE assistant. Return ONLY valid JSON with keys: "
        "summary, root_cause, proposed_fix, risk_level, estimated_impact. "
        "risk_level must be one of: low, medium, high. "
        "Keep summary under 2 sentences. Do not use markdown."
    )

    user_prompt = (
        "Analyze the alert and provide a concise RCA.\n"
        f"Alert data: {json.dumps(input_payload)}"
    )

    return {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }


def _extract_json(content: str) -> Optional[Dict[str, Any]]:
    if not content:
        return None

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _coerce_analysis(data: Dict[str, Any], severity: str) -> Dict[str, Any]:
    summary = _coerce_string(data.get("summary"))
    root_cause = _coerce_string(
        data.get("root_cause")
        or data.get("rootCause")
        or data.get("cause")
    )
    proposed_fix = _coerce_string(
        data.get("proposed_fix")
        or data.get("proposedFix")
        or data.get("recommended_action")
        or data.get("recommendedAction")
    )
    risk_level = _normalize_risk_level(
        _coerce_string(
            data.get("risk_level") or data.get("riskLevel") or data.get("risk")
        ),
        severity,
    )
    estimated_impact = _coerce_string(
        data.get("estimated_impact") or data.get("estimatedImpact") or data.get("impact")
    )

    if not summary:
        summary = "Alert requires investigation; automated analysis returned no summary."
    if not root_cause:
        root_cause = "Likely resource or dependency issue; additional investigation needed."
    if not proposed_fix:
        proposed_fix = "Inspect recent changes, logs, and resource utilization."
    if not estimated_impact:
        estimated_impact = _impact_from_risk(risk_level)

    return {
        "summary": summary,
        "root_cause": root_cause,
        "proposed_fix": proposed_fix,
        "risk_level": risk_level,
        "estimated_impact": estimated_impact,
    }


def _heuristic_analysis(
    alert_type: str,
    severity: str,
    metric: str,
    current_value: float,
    threshold: float,
    affected_resource: str,
    logs: list,
    metadata: dict,
    *,
    raw_response: str,
    error: str,
) -> Dict[str, Any]:
    combined = " ".join(
        part
        for part in [
            alert_type or "",
            metric or "",
            affected_resource or "",
            str(metadata.get("service", "")),
        ]
        if part
    ).lower()

    if "disk" in combined or "storage" in combined:
        root_cause = "Disk usage exceeded threshold, likely from logs or temp files."
        proposed_fix = "Clean up logs/temp files and verify disk growth or expansion."
    elif "cpu" in combined:
        root_cause = "CPU saturation likely due to load spike or runaway process."
        proposed_fix = "Scale up, restart hot processes, and review recent deployments."
    elif "memory" in combined or "ram" in combined:
        root_cause = "Memory pressure likely from a leak or increased workload."
        proposed_fix = "Restart the service and review memory usage trends."
    elif "latency" in combined or "network" in combined:
        root_cause = "High latency indicates network congestion or dependency slowness."
        proposed_fix = "Check upstream dependencies and network throughput/errors."
    elif "container" in combined or "pod" in combined or "service down" in combined:
        root_cause = "Service or container instability detected."
        proposed_fix = "Restart the service and review crash logs."
    else:
        root_cause = "Anomalous metric exceeded threshold; likely resource or dependency issue."
        proposed_fix = "Inspect logs, recent changes, and resource utilization."

    risk_level = _risk_from_severity(severity, current_value, threshold)
    summary = (
        f"{alert_type} on {affected_resource}: {metric}={current_value} "
        f"exceeds threshold {threshold}."
    )

    return {
        "summary": summary,
        "root_cause": root_cause,
        "proposed_fix": proposed_fix,
        "risk_level": risk_level,
        "estimated_impact": _impact_from_risk(risk_level),
        "raw_response": raw_response or error,
    }


def _risk_from_severity(severity: str, current_value: float, threshold: float) -> str:
    normalized = _normalize_risk_level(severity, severity)
    if threshold and current_value >= threshold * 1.5:
        return "high"
    return normalized


def _normalize_risk_level(value: Optional[str], fallback_severity: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        raw = (fallback_severity or "").strip().lower()

    if any(term in raw for term in ["critical", "high", "severe"]):
        return "high"
    if any(term in raw for term in ["medium", "moderate", "warn", "warning"]):
        return "medium"
    if any(term in raw for term in ["low", "info", "minor"]):
        return "low"
    return "medium"


def _impact_from_risk(risk_level: str) -> str:
    if risk_level == "high":
        return "High risk of service degradation or outage if not mitigated."
    if risk_level == "low":
        return "Limited impact expected; monitor and address during normal operations."
    return "Moderate impact possible; mitigate promptly to avoid escalation."


def _coerce_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()
