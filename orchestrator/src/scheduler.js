const { v4: uuidv4 } = require('uuid');
const NodeManager = require('./node-manager');
const logger = require('./logger');

class TaskScheduler {
  constructor() {
    this.nodeManager = new NodeManager();
    this.taskQueue = [];
    this.activeTasks = new Map();
  }

  async scheduleFunction(fnConfig) {
    const taskId = uuidv4();
    const edgeNode = await this.nodeManager.getOptimalNode(fnConfig.requirements);
    
    if (!edgeNode) {
      throw new Error('No available edge nodes meeting requirements');
    }

    const task = {
      id: taskId,
      function: fnConfig,
      node: edgeNode,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.taskQueue.push(task);
    this.activeTasks.set(taskId, task);
    
    logger.info(`Scheduled task ${taskId} for function ${fnConfig.name}`);
    
    await this.deployToEdge(task);
    return taskId;
  }

  async deployToEdge(task) {
    try {
      const response = await fetch(`http://${task.node.ip}:${task.node.port}/deploy`, {
        method: 'POST',
        body: JSON.stringify({
          ...task.function,
          taskId: task.id
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EDGE_AUTH_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error(`Deployment failed: ${response.statusText}`);
      }

      task.status = 'deployed';
      task.deployedAt = new Date().toISOString();
      logger.info(`Deployed task ${task.id} to node ${task.node.id}`);

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      logger.error(`Deployment failed for task ${task.id}: ${error.message}`);
      await this.retryDeployment(task);
    }
  }

  async retryDeployment(task, attempt = 1) {
    if (attempt > 3) {
      logger.error(`Task ${task.id} failed after 3 attempts`);
      return;
    }

    const backoff = Math.pow(2, attempt) * 1000;
    await new Promise(resolve => setTimeout(resolve, backoff));

    logger.info(`Retrying deployment for task ${task.id} (attempt ${attempt})`);
    await this.deployToEdge(task);
  }

  getTaskStatus(taskId) {
    return this.activeTasks.get(taskId) || { error: 'Task not found' };
  }
}

module.exports = TaskScheduler;