# 🛡️ **Sentinel : Autonomous Site Reliability Engineering Platform**

## **Sentinel is an autonomous Site Reliability Engineering (SRE) agent that continuously watches system health, uses AI to understand what went wrong, applies safety checks, and fixes issues automatically when safe or with human approval when needed.**

## 🏗️ **Architecture**

### **Production Monitoring Stack**

#### **Infrastructure Metrics Collection**
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│  cAdvisor       │    │ Node Exporter│    │ Prometheus  │
│  (Docker)       │───▶│ (System)     │───▶│ (Time-series│
│  - Containers   │    │ - CPU        │    │  Database)  │
│  - CPU/Memory   │    │ - Memory     │    │  - Queries  │
└─────────────────┘    └──────────────┘    └─────────────┘
         │                       │                   │
         ▼                       ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              Sential Monitoring Layer                            │
│  - Health checks with REAL thresholds                           │
│  - Alert detection from actual metrics                          │
│  - Latency calculation: 25ms base + 2ms/MB/s + 100ms/error     │
└─────────────────────────────────────────────────────────────────┘
```

#### **Real Threshold Configuration**
- **Memory**: Triggers at **60%** usage
- **CPU**: Triggers at **80%** usage  
- **Disk**: Triggers at **95%** usage
- **Network Latency**: Triggers at **200ms**
- **Container Status**: Any container down = Critical

#### **Calculated Latency Formula**
```typescript
// Real latency calculation based on network activity
const baseLatency = 25                    // Base network latency
const loadLatency = networkMBps * 2       // +2ms per MB/s traffic
const errorLatency = networkErrors * 100  // +100ms per error/sec
const simulatedLatency = baseLatency + loadLatency + errorLatency
```

### **Complete Observability Stack**

#### **Distributed Tracing & Metrics**
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ OpenTelemetry│───▶│    Jaeger    │    │   Grafana   │
│ (Tracing)    │    │ (UI & Query) │    │ (Dashboards)│
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Production Monitoring                          │
│  - Distributed request tracing across all steps            │
│  - Visual workflow analysis in Jaeger UI                   │
│  - Custom dashboards for infrastructure metrics            │
└─────────────────────────────────────────────────────────────┘
```

**Jaeger Features:**
- Distributed request tracing across all Motia steps
- Visual workflow analysis and bottleneck identification  
- Service dependency mapping
- Performance metrics and latency analysis

**Grafana Features:**
- Real-time infrastructure dashboards
- Prometheus metric visualization
- Custom alerts and notifications
- Historical trend analysis

### **Security & Safety Architecture**

#### **Multi-Layer Security**
```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Auth     │  │  Sandbox    │  │  Rollback   │         │
│  │    RBAC     │  │   Safety    │  │ Snapshots   │         │
│  │  - Admin    │  │ - Isolated  │  │ - Before    │         │
│  │  - Operator │  │ - /Motia/Sandbox │ - After Fix │         │
│  │  - Viewer   │  │ - Real Exec │  │ - Procedures│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

#### **Authentication & Authorization**
- **API Key Authentication** with role-based access control
- **Admin Role**: Full access (approve, trigger, rollback, sandbox cleanup)
- **Operator Role**: View and approve incidents
- **Viewer Role**: Read-only access

#### **Safe Sandbox Execution**
- **Isolated Directory**: `/home/sidharth/Desktop/Motia/Sandbox` only
- **Real Disk Cleanup**: Actually removes files from safe directories
- **Preserved Data**: Never touches `data/` subdirectory
- **Threshold Monitoring**: Alerts at 100MB sandbox size

#### **Rollback by Snapshot Creation**
```typescript
// Captures "before" state before applying any fix
const snapshot = {
  incidentId,
  beforeState: { /* captured metrics */ },
  fixApplied: "memory_limit_adjustment",
  rollbackProcedure: [ /* steps */ ]
}
```

### **State Management & Caching**
- **Motia States Plugin** with TTL and caching
- **Incident Lifecycle Tracking**: Complete audit trail
- **Rollback History**: Success/failure rates and procedures
- **Pending Approvals**: Real-time status tracking

---

## 🧠 **AI-Powered Analysis**

### **DeepSeek R1 Integration**
```python
# Real AI analysis using OpenRouter API
async def handler(alert, context):
    analysis = await client.analyze_alert(
        alert_type=alert_type,
        severity=severity, 
        metric=metric,
        current_value=value,
        threshold=threshold,
        affected_resource=resource,
        system_context=context
    )
    
    return {
        "root_cause": analysis.root_cause,
        "proposed_fix": analysis.recommended_action,
        "risk_level": analysis.risk_assessment,
        "confidence": analysis.confidence_score
    }
```

**AI Analysis Includes:**
- **Root Cause Identification**: DeepSeek R1 reasoning
- **Risk Assessment**: Low/Medium/High classification  
- **Proposed Fix**: Specific remediation actions

---

## 🛠️ **Actual Fixes Executed**

Sentinel performs **real actions**, not simulations:

* Sandbox directory cleanup (logs, temp, cache only)
* Container memory analysis via `docker stats`
* Docker container restarts
* Slack-based approvals and execution

**Example:**
High memory alert → Sentinel runs `docker stats` → presents restart options → operator approves directly in Slack.

---

## 🎛️ **Real-Time Dashboard**

### **Live Infrastructure Monitoring**
- **SSE Streaming**: Real-time incident updates
- **Infrastructure Metrics**: From Prometheus (cAdvisor + Node Exporter)
- **Network Latency**: Calculated live (25ms base + load + errors)
- **Interactive Controls**: Manual approval with auth, rollback
---
### **Dashboard Features**
- **Live Metrics**: CPU, Memory, Disk, Network, Containers
- **Incident Timeline**: Real-time status updates
- **Approval Queue**: Interactive human approval workflow
---

## 🔧 **Complete Motia Feature Implementation**

| # | **Motia Feature** | **Sential Implementation** | **Real Production Use** |
|---|-------------------|----------------------------|------------------------|
| 1 | **Cron Steps** | `src/monitoring/infrastructure-monitor.step.ts` | Scheduled monitoring every 2 minutes |
| 2 | **API Steps** | `src/api/` (8+ endpoints) | REST API, webhooks, dashboard |
| 3 | **Event Steps** | `src/ai/`, `src/policy/`, `src/execution/` | Background processing workflows |
| 4 | **Python Steps** | `src/ai/root_cause_analysis_step.py` | AI analysis with DeepSeek R1 |
| 5 | **TypeScript Steps** | All `.step.ts` files | Business logic, policy engine |
| 6 | **State Management** | Motia States plugin | Incident tracking, TTL, caching |
| 7 | **Streams** | SSE streaming | Real-time dashboard updates |
| 8 | **Middlewares** | `middlewares/` directory | Auth, error handling, logging |
| 9 | **Virtual Steps** | `src/flows/approval-gate.step.ts` | Workflow visualization |
| 10 | **Flows** | `sentinal-sre` complete flow | Full incident resolution pipeline |
| 11 | **Conditional Emits** | Policy engine routing | Risk-based smart decision making |
| 12 | **Error Handling** | Built-in retry mechanisms | 3x retry with exponential backoff |
| 13 | **Polyglot** | TypeScript + Python | Optimal language per task |

---
Demo Link : https://youtu.be/QEWtsZIajeY
---
Example Real case workflow :

```
1. MONITORING
   ┌─────────────────┐
   │ Cron Step       │  Every 2 minutes
   │ (Monitoring)    │
   └─────────────────┘
          │
          ▼
2. ALERT DETECTION
   ┌─────────────────┐    ┌──────────────────────────┐
   │ Health Checks   │───▶│ Alert Creation            │
   │ (Prometheus)    │    │ (Real Thresholds)         │
   └─────────────────┘    └──────────────────────────┘
                                   │
                                   ▼
3. AI ANALYSIS
   ┌─────────────────┐    ┌──────────────────────────┐
   │ Python Step     │───▶│ DeepSeek R1               │
   │ (AI Brain)      │    │ Root Cause Analysis       │
   └─────────────────┘    └──────────────────────────┘
                                   │
                                   ▼
4. RISK ASSESSMENT
   ┌─────────────────┐    ┌──────────────────────────┐
   │ Policy Engine   │───▶│ Risk Level Classification │
   │ (TypeScript)    │    │ (Low / Medium / High)     │
   └─────────────────┘    └──────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
     LOW RISK                  MEDIUM RISK              HIGH RISK
     (Auto-fix)              (Human Approval)        (Admin Required)
          │                        │                        │
          ▼                        ▼                        ▼
5. APPROVAL & TRIGGER
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │ Auto Trigger    │    │ Slack / API     │    │ Admin Auth      │
   │ (Event Step)    │    │ Approval        │    │ Approval        │
   └─────────────────┘    └─────────────────┘    └─────────────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                                   ▼
6. EXECUTION LAYER
   ┌──────────────────────────────────────────┐
   │            EXECUTION LAYER               │
   ├──────────────────────────────────────────┤
   │ • Sandbox Cleanup (real file operations) │
   │ • Container Restart (Docker CLI)         │
   │ • Scenario Reset (state management)      │
   └──────────────────────────────────────────┘
                                   │
                                   ▼
7. VERIFICATION & ROLLBACK
   ┌─────────────────┐    ┌──────────────────────────┐
   │ Verify Metrics  │───▶│ Snapshot + Rollback      │
   │ (Prometheus)    │    │ (If degradation detected)│
   └─────────────────┘    └──────────────────────────┘
                                   │
                                   ▼
8. COMPLETION
   ┌──────────────────────────────────────────┐
   │ State Update + Audit Trail + Metrics     │
   │ Incident Closed or Escalated             │
   └──────────────────────────────────────────┘

```


## 🚀 Setup Instructions

### Prerequisites
```bash
# Required
- Node.js 18+
- npm or yarn
- Docker (for container monitoring)
- Prometheus + node-exporter (optional, has fallback)

# Optional
- Slack webhook URL (for notifications)
- OpenRouter API key (for AI analysis)
```

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd Sentinal

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your API keys:
# - OPENROUTER_API_KEY=your_key
# - SLACK_WEBHOOK_URL=your_webhook
# - PUBLIC_URL=http://localhost:3000

# 4. Start development server
npm run dev

# 5. Open dashboard
open http://localhost:3000/dashboard.html

# 6. Test Real Features
```bash
# Trigger a real incident (requires admin API key)
curl -H "X-API-Key: sk-sentinal-admin-demo-key-12345" \
     http://localhost:3000/api/trigger-alert

# Monitor real metrics
curl http://localhost:3000/api/infrastructure-status

# View pending approvals  
curl -H "X-API-Key: sk-sentinal-operator-demo-key-67890" \
     http://localhost:3000/api/approvals/pending
```

---


## 🔑 **API Keys for Testing**

| **Role** | **API Key** | **Permissions** |
|----------|-------------|-----------------|
| **Admin** | `sk-sentinal-admin-demo-key-12345` | Full access + sandbox cleanup |
| **Operator** | `sk-sentinal-operator-demo-key-67890` | View + approve incidents |
| **Viewer** | `sk-sentinal-viewer-demo-key-11111` | Read-only access |

---

## 🤝 Contributing
This is a hackathon project. Contributions welcome after the event!

---

Built with ❤️ for the hackathon.Thanks to System Failres

---

**⭐ Star this repo if you find it useful!**
