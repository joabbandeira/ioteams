import { acquireWriter, inspectRepository, RuntimePolicyError } from '@ioteams/runtime'
try {
  const writer = await acquireWriter(await inspectRepository(process.argv[2], 'origin'), process.argv[3])
  await writer.release()
  console.log('acquired')
} catch (error) {
  if (!(error instanceof RuntimePolicyError)) throw error
  console.log(error.code)
  process.exitCode = 2
}
