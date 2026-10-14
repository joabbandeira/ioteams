import { runCli } from './cli.js'
import { CliError } from './state.js'
const controller = new AbortController()
const interrupt = () => controller.abort()
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
try {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text), signal: controller.signal,
    async stdin() {
      const abort = () => process.stdin.destroy(new CliError('INTERRUPTED',130))
      controller.signal.addEventListener('abort',abort,{once:true})
      try {
        if(controller.signal.aborted) throw new CliError('INTERRUPTED',130)
        const parts: Buffer[] = []; let length = 0
        for await (const part of process.stdin) { length += part.length; if (length > 1_048_576) throw new CliError('INVALID_INPUT',2); parts.push(Buffer.from(part)) }
        return Buffer.concat(parts).toString('utf8')
      } finally {controller.signal.removeEventListener('abort',abort)}
    },
  })
} finally { process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt) }
