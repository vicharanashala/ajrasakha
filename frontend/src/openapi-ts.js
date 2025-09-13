import { createClient, defaultPlugins } from '@hey-api/openapi-ts';

createClient({
  input: 'C:\\Users\\Aditya\\Downloads\\vibe-api-documentation (23).yaml',
  output: 'src/client',
  plugins: [
    ...defaultPlugins,
    // Add any custom plugins here
    {
      asClass: false,
      name: '@hey-api/sdk'
    },
    '@tanstack/react-query'
  ],
});