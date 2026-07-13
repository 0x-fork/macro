import { defineConfig } from '@hey-api/openapi-ts';
import { services } from './services';

const CLIENTS = '../../apps/web/src/lib/service-clients';

export default defineConfig(
  services.map((service) => ({
    input: `${CLIENTS}/service-${service}/openapi.json`,
    output: {
      path: `./generated/${service}`,
    },
    plugins: [
      '@hey-api/client-fetch',
      '@hey-api/typescript',
      {
        name: '@hey-api/sdk',
        operations: { strategy: 'single', methods: 'instance' },
      },
    ],
  })),
);
