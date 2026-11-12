import assert from 'node:assert/strict';

import Fastify from 'fastify'
import { ApiRouter } from './routes/router.ts'

const fastify = Fastify({
  logger: true
})

fastify.register(ApiRouter, { prefix: '/api' })


fastify.listen({ port: 3777 }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
