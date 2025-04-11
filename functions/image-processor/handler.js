const sharp = require('sharp');
const { performance } = require('perf_hooks');

module.exports = async (event, context) => {
  const start = performance.now();
  
  try {
    // Validate input
    if (!event.image || !event.operations) {
      throw new Error('Invalid input: image and operations required');
    }

    // Process image
    let processor = sharp(Buffer.from(event.image, 'base64'));
    
    for (const op of event.operations) {
      switch(op.type) {
        case 'resize':
          if (!op.width || !op.height) {
            throw new Error('Resize operation requires width and height');
          }
          processor = processor.resize(op.width, op.height);
          break;
          
        case 'rotate':
          processor = processor.rotate(op.degrees || 0);
          break;
          
        case 'grayscale':
          processor = processor.grayscale();
          break;
          
        default:
          throw new Error(`Unsupported operation: ${op.type}`);
      }
    }

    // Get result
    const outputBuffer = await processor.toBuffer();
    const metadata = await processor.metadata();
    
    return {
      success: true,
      image: outputBuffer.toString('base64'),
      metadata,
      timing: {
        processingTime: performance.now() - start
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timing: {
        processingTime: performance.now() - start
      }
    };
  }
};