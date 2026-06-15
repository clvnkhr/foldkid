import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'

const rawArgs = process.argv.slice(2)
const forwardedArgs = []
let port = process.env.PORT ?? '5173'

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index]
  if (arg === '--port' || arg === '-p') {
    port = rawArgs[index + 1] ?? port
    index += 1
  } else if (arg?.startsWith('--port=')) {
    port = arg.slice('--port='.length)
  } else {
    forwardedArgs.push(arg)
  }
}

const localIps = Object.values(networkInterfaces())
  .flatMap(network => network ?? [])
  .filter(address => address.family === 'IPv4' && !address.internal)
  .map(address => address.address)

const viteBin = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
)

if (!existsSync(viteBin)) {
  console.error('Vite was not found in node_modules. Run `npm install` first.')
  process.exit(1)
}

console.log('\nFoldkid mobile dev server')
console.log('Connect your phone to the same Wi-Fi, then open:')

if (localIps.length === 0) {
  console.log(`  http://YOUR_MAC_IP:${port}/`)
  console.log('\nCould not detect a LAN IP automatically.')
} else {
  for (const ip of localIps) {
    console.log(`  http://${ip}:${port}/`)
  }
}

console.log('\nLeave this terminal running while you test.\n')

const vite = spawn(viteBin, ['--host', '0.0.0.0', '--port', port, '--strictPort', ...forwardedArgs], {
  stdio: 'inherit',
})

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
