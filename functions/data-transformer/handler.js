const { performance } = require('perf_hooks');
const logger = require('./logger'); // Optional logging

module.exports = async (event, context) => {
    const startTime = performance.now();
    
    try {
        // Validate input
        if (!event || !event.records) {
            throw new Error("Input must contain 'records' array");
        }

        // Configuration (could be passed in event)
        const config = {
            maxBatchSize: event.config?.maxBatchSize || 1000,
            transformations: event.transformations || [
                { field: 'timestamp', type: 'date' },
                { field: 'value', type: 'number' }
            ]
        };

        // Process records
        const results = {
            successful: 0,
            failed: 0,
            processedRecords: []
        };

        for (const record of event.records.slice(0, config.maxBatchSize)) {
            try {
                const transformed = transformRecord(record, config.transformations);
                results.processedRecords.push(transformed);
                results.successful++;
            } catch (error) {
                results.failed++;
                if (event.config?.includeErrors) {
                    results.processedRecords.push({
                        error: error.message,
                        original: record
                    });
                }
            }
        }

        // Calculate metrics
        const duration = performance.now() - startTime;
        const metrics = {
            processingTimeMs: duration,
            throughput: results.processedRecords.length / (duration / 1000),
            memoryUsage: process.memoryUsage().rss
        };

        return {
            status: 'completed',
            results,
            metrics,
            configUsed: config
        };

    } catch (error) {
        // Top-level error handling
        return {
            status: 'failed',
            error: {
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            metrics: {
                processingTimeMs: performance.now() - startTime
            }
        };
    }
};

function transformRecord(record, transformations) {
    const result = { ...record };

    for (const transform of transformations) {
        switch (transform.type) {
            case 'date':
                if (result[transform.field]) {
                    result[transform.field] = new Date(result[transform.field]).toISOString();
                }
                break;

            case 'number':
                if (result[transform.field]) {
                    const num = Number(result[transform.field]);
                    if (isNaN(num)) throw new Error(`Invalid number: ${result[transform.field]}`);
                    result[transform.field] = num;
                }
                break;

            case 'rename':
                if (result[transform.from]) {
                    result[transform.to] = result[transform.from];
                    delete result[transform.from];
                }
                break;

            case 'calculate':
                if (transform.expression) {
                    result[transform.targetField] = evalExpression(
                        transform.expression, 
                        record
                    );
                }
                break;

            default:
                throw new Error(`Unknown transformation type: ${transform.type}`);
        }
    }

    return result;
}

function evalExpression(expr, record) {
   
    try {
        return Function(
            'record',
            `return (${expr.replace(/record\.(\w+)/g, 'record["$1"]')})`
        )(record);
    } catch (error) {
        throw new Error(`Expression evaluation failed: ${error.message}`);
    }
}


function createLogger() {
    return {
        info: (msg) => console.log(JSON.stringify({ level: 'info', message: msg })),
        error: (msg) => console.error(JSON.stringify({ level: 'error', message: msg }))
    };
}

const logger = createLogger();