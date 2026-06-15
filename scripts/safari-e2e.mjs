#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const OPT_IN_ENV = 'FOLDKID_SAFARI_E2E'
const DEFAULT_PORT = '5173'
const port = process.env.FOLDKID_SAFARI_PORT ?? DEFAULT_PORT
const targetUrl = process.env.FOLDKID_SAFARI_URL ?? `http://127.0.0.1:${port}/`
const startedByScript = { process: undefined }

const log = (message) => {
  process.stdout.write(`[safari-e2e] ${message}\n`)
}

const fail = (message) => {
  throw new Error(message)
}

const SAFARI_APPLE_EVENTS_HELP = [
  'Safari refused JavaScript from Apple Events.',
  'Enable it in Safari before running this test:',
  '1. Safari > Settings > Advanced > Show features for web developers',
  '2. Safari > Develop > Allow JavaScript from Apple Events',
  '',
  'This is required whether the script uses JXA or AppleScript via osascript.',
].join('\n')

if (process.platform !== 'darwin') {
  fail('Safari E2E tests only run on macOS.')
}

if (process.env[OPT_IN_ENV] !== '1') {
  fail(`Refusing to take control of Safari. Run through "npm run test:safari" or set ${OPT_IN_ENV}=1 explicitly.`)
}

const cleanup = () => {
  if (startedByScript.process && !startedByScript.process.killed) {
    startedByScript.process.kill('SIGTERM')
  }
  startedByScript.process = undefined
}

process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

const requestOk = (url) =>
  new Promise(resolve => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, res => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })

const waitForHttp = async (url, timeoutMs) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await requestOk(url)) return
    await delay(250)
  }
  fail(`Timed out waiting for ${url}`)
}

const ensureServer = async () => {
  if (await requestOk(targetUrl)) {
    log(`using existing app at ${targetUrl}`)
    return
  }

  log(`starting Vite dev server at ${targetUrl}`)
  startedByScript.process = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let serverOutput = ''
  startedByScript.process.stdout.on('data', chunk => {
    serverOutput += chunk.toString()
  })
  startedByScript.process.stderr.on('data', chunk => {
    serverOutput += chunk.toString()
  })
  startedByScript.process.on('exit', code => {
    if (code !== null && code !== 0) {
      process.stderr.write(serverOutput)
    }
  })

  await waitForHttp(targetUrl, 15_000)
}

const runJxa = (source) =>
  execFileSync('osascript', ['-l', 'JavaScript', '-e', source], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  }).trim()

const openSafari = (url) => {
  log('opening Safari; this will focus Safari and drive the page')
  execFileSync('open', ['-a', 'Safari', url], { stdio: 'ignore' })
  runJxa(`
    const safari = Application('Safari')
    safari.activate()
  `)
}

const evalInSafari = (fn, ...args) => {
  const pageScript = `
    (() => {
      try {
        const fn = ${fn.toString()}
        const value = fn(...${JSON.stringify(args)})
        return JSON.stringify({ ok: true, value })
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: String(error),
          stack: error && error.stack ? String(error.stack) : ''
        })
      }
    })()
  `

  let raw
  try {
    raw = runJxa(`
      const safari = Application('Safari')
      safari.activate()
      if (safari.documents.length === 0) {
        throw new Error('Safari has no open documents')
      }
      safari.doJavaScript(${JSON.stringify(pageScript)}, { in: safari.documents[0] })
    `)
  } catch (error) {
    const message = String(error)
    if (message.includes('Allow JavaScript from Apple Events')) {
      fail(SAFARI_APPLE_EVENTS_HELP)
    }
    fail(`Safari JavaScript execution failed.\n${message}`)
  }

  const decoded = JSON.parse(raw)
  if (!decoded.ok) {
    fail(`${decoded.error}\n${decoded.stack}`)
  }
  return decoded.value
}

const waitForSafari = async (label, fn, timeoutMs = 7_500, ...args) => {
  const start = Date.now()
  let lastError = ''
  while (Date.now() - start < timeoutMs) {
    try {
      const value = evalInSafari(fn, ...args)
      if (value) return value
    } catch (error) {
      lastError = String(error)
    }
    await delay(200)
  }
  fail(`Timed out waiting for ${label}${lastError ? `\nLast error: ${lastError}` : ''}`)
}

const getDevToolsHistory = () => evalInSafari(() => {
  const host = document.getElementById('foldkit-devtools')
  const root = host?.shadowRoot
  if (!root) throw new Error('Foldkit DevTools shadow root not found')
  const badge = root.querySelector('.dt-badge')
  if (!root.querySelector('.dt-panel')) {
    if (!(badge instanceof HTMLElement)) throw new Error('Foldkit DevTools badge not found')
    badge.click()
  }
  const rows = Array.from(root.querySelectorAll('.message-list li'))
    .map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  return {
    rows,
    text: root.textContent ?? '',
  }
})

const assertDevToolsIncludes = async (label, tags) => {
  const history = await waitForSafari(label, expectedTags => {
    const host = document.getElementById('foldkit-devtools')
    const root = host?.shadowRoot
    if (!root) return false
    if (!root.querySelector('.dt-panel')) {
      const badge = root.querySelector('.dt-badge')
      if (badge instanceof HTMLElement) badge.click()
    }
    const text = root.textContent ?? ''
    return expectedTags.every(tag => text.includes(tag))
  }, 7_500, tags)
  if (!history) fail(`DevTools did not include ${tags.join(', ')}`)
  log(`verified ${label}: ${tags.join(', ')}`)
}

const clickGame = async (name) => {
  evalInSafari(gameName => {
    const card = Array.from(document.querySelectorAll('.game-card'))
      .find(el => el.textContent?.includes(gameName))
    if (!(card instanceof HTMLElement)) throw new Error(`Game card not found: ${gameName}`)
    card.click()
  }, name)
}

const clickBack = async () => {
  evalInSafari(() => {
    const back = document.querySelector('.back-btn')
    if (!(back instanceof HTMLElement)) throw new Error('Back button not found')
    back.click()
  })
}

const pointerTap = (selector, label) => {
  evalInSafari((targetSelector, targetLabel) => {
    const target = document.querySelector(targetSelector)
    if (!(target instanceof HTMLElement)) throw new Error(`${targetLabel} not found: ${targetSelector}`)
    const rect = target.getBoundingClientRect()
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }
    const EventCtor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    target.dispatchEvent(new EventCtor('pointerdown', init))
    target.dispatchEvent(new EventCtor('pointerup', init))
  }, selector, label)
}

const clickSelector = (selector, label) => {
  evalInSafari((targetSelector, targetLabel) => {
    const target = document.querySelector(targetSelector)
    if (!(target instanceof HTMLElement)) throw new Error(`${targetLabel} not found: ${targetSelector}`)
    target.click()
  }, selector, label)
}

const run = async () => {
  log('optional Safari E2E smoke starting')
  await ensureServer()
  openSafari(targetUrl)

  await waitForSafari('app and Foldkit DevTools boot', () =>
    document.readyState === 'complete' &&
    Boolean(document.querySelector('.landing')) &&
    Boolean(document.getElementById('foldkit-devtools')?.shadowRoot),
  )
  getDevToolsHistory()

  await clickGame('Counter')
  await assertDevToolsIncludes('Counter navigation', ['ClickedCounter'])
  pointerTap('button.btn-primary:last-child', 'Counter +1 button')
  await assertDevToolsIncludes('Counter increment audio flow', [
    'CounterPointerDown',
    'CounterPressedIncrement',
    'CounterSoundPlayed',
  ])
  await clickBack()
  await assertDevToolsIncludes('Back to landing from Counter', ['ClickedLanding'])

  await clickGame('Bubbles')
  await assertDevToolsIncludes('Bubbles navigation', ['ClickedBubbles'])
  pointerTap('.color-btn[data-color="rainbow"]', 'Bubbles rainbow color button')
  await assertDevToolsIncludes('Bubbles color audio flow', [
    'BubblesClickedColor',
    'BubblesSoundPlayed',
  ])
  await clickBack()

  await clickGame('Music Box')
  await assertDevToolsIncludes('MusicBox navigation', ['ClickedMusicBox'])
  pointerTap('[data-pitch="C4"]', 'MusicBox C4 key')
  await assertDevToolsIncludes('MusicBox note flow', [
    'MusicBoxNoteOn',
    'MusicBoxNoteOff',
  ])
  await clickBack()

  await clickGame('Find It')
  await assertDevToolsIncludes('Find It navigation', ['ClickedFindIt'])
  await clickBack()

  clickSelector('.diag-link', 'Audio Test diagnostic link')
  await assertDevToolsIncludes('Audio Test navigation', ['ClickedAudioTest'])

  await clickBack()
  await assertDevToolsIncludes('Final back to landing', ['ClickedLanding'])

  log('Safari E2E smoke passed')
  cleanup()
}

run().catch(error => {
  cleanup()
  process.stderr.write(`\n[safari-e2e] FAILED\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
