const logger = require('./logger');

class NodeManager {
  constructor() {
    this.nodes = new Map();
    this.nodeStatus = new Map();
  }

  registerNode(node) {
    this.nodes.set(node.id, node);
    this.nodeStatus.set(node.id, {
      lastHeartbeat: Date.now(),
      resources: node.resources,
      currentLoad: 0
    });
    logger.info(`Registered edge node ${node.id}`);
  }

  async getOptimalNode(requirements = {}) {
    // Simple round-robin selection (replace with actual scheduling logic)
    const availableNodes = Array.from(this.nodes.values()).filter(node => {
      const status = this.nodeStatus.get(node.id);
      return (
        status &&
        status.resources.memory >= (requirements.memory || 0) &&
        status.resources.cpus >= (requirements.cpus || 0) &&
        status.currentLoad < 0.8 // 80% load threshold
      );
    });

    if (availableNodes.length === 0) {
      return null;
    }

    // Select node with lowest current load
    return availableNodes.reduce((prev, current) => {
      const prevLoad = this.nodeStatus.get(prev.id).currentLoad;
      const currLoad = this.nodeStatus.get(current.id).currentLoad;
      return currLoad < prevLoad ? current : prev;
    });
  }

  updateNodeStatus(nodeId, statusUpdate) {
    if (!this.nodeStatus.has(nodeId)) return;
    
    const currentStatus = this.nodeStatus.get(nodeId);
    this.nodeStatus.set(nodeId, {
      ...currentStatus,
      ...statusUpdate,
      lastHeartbeat: Date.now()
    });
  }
}

module.exports = NodeManager;