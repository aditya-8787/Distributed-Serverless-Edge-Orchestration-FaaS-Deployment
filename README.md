# Distributed Serverless Edge Orchestration (FaaS Deployment)

![System Architecture Diagram](https://i.imgur.com/JK9qL0m.png)  
*Figure 1: High-level system architecture*

A lightweight, high-performance framework for deploying and orchestrating serverless functions across edge devices with support for both Node.js and WebAssembly runtimes.

## Key Features

- 🚀 **Multi-runtime Support**: Execute functions in Node.js or WebAssembly
- 🌐 **Edge-native**: Designed for low-latency edge deployments
- ⚖️ **Intelligent Scheduling**: Dynamic workload distribution
- 🔒 **Secure Execution**: Sandboxed function environments
- 📊 **Real-time Monitoring**: Built-in performance metrics

## System Components

| Component | Description | Technology |
|-----------|-------------|------------|
| Orchestrator | Central scheduling system | Node.js, Express |
| Node Connector | Node.js runtime for edge execution | Node.js, Docker |
| WASM Runtime | WebAssembly execution environment | WASI, WASMtime |
| Functions | Deployable serverless units | Node.js/WASM |

![Workflow Diagram](https://i.imgur.com/8X7pQ9z.png)  
*Figure 2: Request processing workflow*

## Getting Started

### Prerequisites

- Node.js 18+
- Docker 20+
- Rust (for WASM compilation)
- Make (optional)

### Installation

```bash
# Clone repository
git clone https://github.com/aditya-8787/Distributed-Serverless-Edge-Orchestration.git
cd Distributed-Serverless-Edge-Orchestration

# Install dependencies
make install  # or run the install script below