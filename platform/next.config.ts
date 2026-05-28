import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'gray-matter', 'js-yaml', 'node-cron'],
}

export default nextConfig
