import { env } from '#root/utils/env.js';
console.log('========== AI CONFIG DEBUG ==========');
console.log('AI_SERVER_IP:', JSON.stringify(env('AI_SERVER_IP')));
console.log('AI_SERVER_PORT:', JSON.stringify(env('AI_SERVER_PORT')));
console.log('Type of AI_SERVER_PORT:', typeof env('AI_SERVER_PORT'));
console.log('Is numeric:', !isNaN(Number(env('AI_SERVER_PORT'))));
console.log('Number value:', Number(env('AI_SERVER_PORT')));
console.log('=====================================');

export const aiConfig = {
    serverIP: env('AI_SERVER_IP') || 'localhost',
    serverPort: Number(env('AI_SERVER_PORT')?.trim()) || 9017,
    proxyAddress: env('AI_PROXY_ADDRESS') || 'socks5h://localhost:1055',
};
