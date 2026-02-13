import os
from typing import Any, Dict, Optional

import httpx
from fastmcp import FastMCP


BASE_URL = os.getenv("SENTINAL_API_BASE_URL", "http://localhost:3000").rstrip("/")
DEFAULT_TIMEOUT = float(os.getenv("SENTINAL_TIMEOUT_SECONDS", "15"))
DEFAULT_API_KEY = os.getenv("SENTINAL_API_KEY")
DEFAULT_ADMIN_KEY = os.getenv("SENTINAL_ADMIN_KEY")

mcp = FastMCP("Sentinal MCP")
_client: Optional[httpx.AsyncClient] = None


def _build_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers: Dict[str, str] = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
    return _client


def _join_url(path: str) -> str:
    return f"{BASE_URL}/{path.lstrip('/')}"


def _require_key(value: Optional[str], env_name: str) -> str:
    if not value:
        raise ValueError(f"Missing API key. Set {env_name} or pass api_key.")
    return value


async def _request(
    method: str,
    path: str,
    *,
    json_body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    client = await _get_client()
    url = _join_url(path)
    response = await client.request(
        method,
        url,
        headers=_build_headers(api_key),
        json=json_body,
        params=params,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Motia API error {response.status_code} for {method} {url}: {response.text}"
        )

    if not response.content:
        return {"status": response.status_code}

    try:
        return response.json()
    except Exception:
        return {"status": response.status_code, "body": response.text}


@mcp.tool
async def trigger_alert(scenario: str) -> Dict[str, Any]:
    """Trigger a demo alert scenario.

    Allowed scenarios:
    - high_memory
    - container_down
    - disk_full
    - network_latency
    - cpu_spike
    - sandbox_disk_full
    """

    return await _request(
        "POST",
        "/trigger-alert",
        json_body={"scenario": scenario},
    )


@mcp.tool
async def clear_scenario() -> Dict[str, Any]:
    """Clear the active alert scenario."""

    return await _request("POST", "/clear-scenario")


@mcp.tool
async def infrastructure_status() -> Dict[str, Any]:
    """Get current infrastructure metrics and recent alerts."""

    return await _request("GET", "/infrastructure/status")


@mcp.tool
async def incident_history() -> Dict[str, Any]:
    """Get incident history and statistics."""

    return await _request("GET", "/incidents/history")


@mcp.tool
async def list_pending_approvals() -> Dict[str, Any]:
    """List all pending approvals."""

    return await _request("GET", "/approvals/pending")


@mcp.tool
async def approve_incident(
    incident_id: str,
    approver: str = "mcp",
    notes: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Approve an incident (requires operator/admin API key)."""

    key = _require_key(api_key or DEFAULT_API_KEY, "SENTINAL_API_KEY")
    payload: Dict[str, Any] = {
        "incidentId": incident_id,
        "action": "approve",
        "approver": approver,
    }
    if notes:
        payload["notes"] = notes

    return await _request(
        "POST",
        "/manual-approval",
        json_body=payload,
        api_key=key,
    )


@mcp.tool
async def reject_incident(
    incident_id: str,
    approver: str = "mcp",
    notes: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Reject an incident (requires operator/admin API key)."""

    key = _require_key(api_key or DEFAULT_API_KEY, "SENTINAL_API_KEY")
    payload: Dict[str, Any] = {
        "incidentId": incident_id,
        "action": "reject",
        "approver": approver,
    }
    if notes:
        payload["notes"] = notes

    return await _request(
        "POST",
        "/manual-approval",
        json_body=payload,
        api_key=key,
    )


@mcp.tool
async def rollback_incident(
    incident_id: str,
    reason: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Trigger rollback for an incident."""

    key = api_key or DEFAULT_ADMIN_KEY or DEFAULT_API_KEY
    payload = {"reason": reason} if reason else None

    return await _request(
        "POST",
        "/rollback",
        params={"incident": incident_id},
        json_body=payload,
        api_key=key,
    )


if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("MCP_PORT", "8000")))
    path = os.getenv("MCP_PATH", "/mcp/")
    mcp.run(transport="http", host=host, port=port, path=path)
