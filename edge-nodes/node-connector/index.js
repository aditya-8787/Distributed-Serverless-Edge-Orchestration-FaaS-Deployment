require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const app = express();
app.use(express.json());

const FUNCTIONS_DIR = path.join(__dirname, 'functions');
if (!fs.existsSync(FUNCTIONS_DIR)) {
  fs.mkdirSync(FUNCTIONS_DIR);
}

const functions = new Map();

// Middleware
function authenticate(req, res, next) {
  const authToken = req.headers['authorization']?.split(' ')[1];
  if (authToken !== process.env.NODE_AUTH_TOKEN) {
    logger.warn('Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/deploy', authenticate, (req, res) => {
  const { id, name, code, runtime, taskId } = req.body;
  
  try {
    // Save function code
    const fnFile = path.join(FUNCTIONS_DIR, `${id}.js`);
    fs.writeFileSync(fnFile, code);
    
    functions.set(id, {
      id,
      name,
      runtime,
      taskId,
      lastUsed: Date.now(),
      stats: { invocations: 0 }
    });
    
    logger.info(`Deployed function ${id} (${name})`);
    res.status(201).json({ status: 'deployed', functionId: id });
  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/invoke/:fnId', authenticate, async (req, res) => {
  const fnId = req.params.fnId;
  const fn = functions.get(fnId);
  
  if (!fn) {
    logger.warn(`Function not found: ${fnId}`);
    return res.status(404).json({ error: 'Function not found' });
  }

  try {
    const startTime = Date.now();
    const result = await executeFunction(fnId, req.body);
    const duration = Date.now() - startTime;

    fn.stats.invocations++;
    fn.lastUsed = Date.now();
    
    logger.info(`Executed function ${fnId} in ${duration}ms`);
    res.json({
      ...result,
      metadata: {
        functionId: fnId,
        duration,
        invocations: fn.stats.invocations
      }
    });
  } catch (error) {
    logger.error(`Execution failed for ${fnId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

async function executeFunction(fnId, input) {
  return new Promise((resolve, reject) => {
    const fnFile = path.join(FUNCTIONS_DIR, `${fnId}.js`);
    const child = exec(
      `node ${fnFile}`,
      { timeout: 10000 }, // 10s timeout
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error('Invalid function output'));
        }
      }
    );

    // Send input to function via stdin
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    functions: functions.size,
    memoryUsage: process.memoryUsage()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Edge node running on port ${PORT}`);
  setInterval(cleanupFunctions, 3600000); // Cleanup every hour
});

function cleanupFunctions() {
  const now = Date.now();
  const inactiveThreshold = 24 * 3600 * 1000; // 24 hours
  
  functions.forEach((fn, id) => {
    if (now - fn.lastUsed > inactiveThreshold) {
      const fnFile = path.join(FUNCTIONS_DIR, `${id}.js`);
      try {
        fs.unlinkSync(fnFile);
        functions.delete(id);
        logger.info(`Cleaned up inactive function ${id}`);
      } catch (error) {
        logger.error(`Cleanup failed for ${id}: ${error.message}`);
      }
    }
  });
}

module.exports = app;