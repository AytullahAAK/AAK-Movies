import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { build } from 'vite'

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('sample action is development-gated and uses the existing direct-video player source', async () => {
  const panel = await readFile(new URL('../src/playback/UniversalPlayerPanel.tsx', import.meta.url), 'utf8')
  const player = await readFile(new URL('../src/playback/NativeVideoPlayer.tsx', import.meta.url), 'utf8')
  const { mdnFlowerSample } = await importTypeScript('../src/playback/devSampleVideo.ts')

  assert.match(panel, /\{import\.meta\.env\.DEV && <button\b/)
  assert.match(panel, />Test with sample video<\/button>/)
  assert.match(panel, /if \(!import\.meta\.env\.DEV\) return/)
  assert.match(panel, /await import\('\.\/devSampleVideo'\)/)
  assert.match(panel, /setSource\(mdnFlowerSample\.source\)/)
  assert.match(panel, /<NativeVideoPlayer source=\{source\}/)
  assert.match(player, /<video[^>]*controls playsInline/)
  assert.equal(mdnFlowerSample.source.contentType, 'video/mp4')
  assert.equal(mdnFlowerSample.source.url, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4')
})

test('production Vite output excludes the development action and sample URL', async () => {
  const result = await build({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false, sourcemap: false, minify: false, reportCompressedSize: false },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
  const emittedText = outputs.map(output => {
    if (output.type === 'chunk') return output.code
    return typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8')
  }).join('\n')

  assert.ok(outputs.some(output => output.type === 'chunk'), 'Vite should emit JavaScript chunks')
  assert.doesNotMatch(emittedText, /https:\/\/interactive-examples\.mdn\.mozilla\.net\/media\/cc0-videos\/flower\.mp4/)
  assert.doesNotMatch(emittedText, /Test with sample video/)
})
