import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'
import { FillBatchError, type FillFieldInput, type SnapshotMode } from '../../../../../../browser/types.ts'

type FillPageBody =
    | {
        browserId: string;
        ref: string;
        value: string;
        fields?: never;
        snapshot?: SnapshotMode;
    }
    | {
        browserId: string;
        fields: FillFieldInput[];
        ref?: never;
        value?: never;
        snapshot?: SnapshotMode;
    };

export function FillPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: FillPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    ref: { type: 'string', minLength: 1 },
                    value: { type: 'string' },
                    snapshot: { type: 'string', enum: ['compact', 'full', 'diff'] },
                    fields: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 50,
                        items: {
                            type: 'object',
                            required: ['ref', 'value'],
                            additionalProperties: false,
                            properties: {
                                ref: { type: 'string', minLength: 1 },
                                value: { type: 'string' },
                            },
                        },
                    },
                },
                oneOf: [
                    {
                        required: ['ref', 'value'],
                        not: { required: ['fields'] },
                    },
                    {
                        required: ['fields'],
                        not: { anyOf: [{ required: ['ref'] }, { required: ['value'] }] },
                    },
                ],
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const body = request.body

        try {
            if ('fields' in body && body.fields) {
                const batchResult = await browserManager.fillFields(body.browserId, pageId, body.fields, { snapshot: body.snapshot })

                if (!batchResult) {
                    return reply.code(404).send({ error: 'Page not found' })
                }

                return reply.send({
                    browserId: body.browserId,
                    pageId,
                    filled: true,
                    ...batchResult,
                })
            }

            const result = await browserManager.fillForm(body.browserId, pageId, body.ref, body.value, { snapshot: body.snapshot })

            if (!result) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId: body.browserId,
                pageId,
                ...result,
            })
        } catch (err) {
            if (err instanceof FillBatchError) {
                return reply.code(400).send({
                    error: err.message,
                    failedRef: err.failedRef,
                    completed: err.completed,
                })
            }

            const message = err instanceof Error ? err.message : 'Fill failed'
            return reply.code(400).send({ error: message })
        }
    })
}
