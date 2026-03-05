import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

// Resolve logs directory path
const logDir = path.resolve(process.cwd(), 'logs');

// Create directory if it doesn't exist
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const jsonWithNewline = winston.format.printf((info) => {
    return JSON.stringify(info, null, 2) + '\n';
});

export const chatbotSimilarityLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        jsonWithNewline
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'chatbot-similarity.log'),
            level: 'info',
        }),
    ],
});