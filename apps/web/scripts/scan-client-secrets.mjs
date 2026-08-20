import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const roots = ['src', 'dist']
const sourceExtensions = new Set(['.html', '.js', '.jsx', '.json', '.ts', '.tsx'])
const rules = [
  ['demo auth symbol', /\b(?:demoUsers|DemoUser)\b/g],
  ['demo identity', /usr-(?:admin|manufacturer|buyer)-001/g],
  ['password assignment', /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/gi],
  ['secret assignment', /(?:secret|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["'][^"']+["']/gi],
  ['private key', /BEGIN [A-Z ]*PRIVATE KEY/g],
  ['JWT literal', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ['eight-digit credential literal', /["']\d{8}["']/g],
  ['local auth read', /localStorage\.getItem\(["']dijitalcam\.auth(?:User|Session)["']\)/g],
]

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path))
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(path)
    }
  }

  return files
}

let findings = 0

for (const root of roots) {
  for (const file of await collectFiles(root)) {
    const content = await readFile(file, 'utf8')
    for (const [name, pattern] of rules) {
      pattern.lastIndex = 0
      const count = [...content.matchAll(pattern)].length
      if (count > 0) {
        findings += count
        console.error(`${root}: ${name}: ${count} finding(s)`)
      }
    }
  }
}

if (findings > 0) {
  console.error(`Client secret scan failed with ${findings} redacted finding(s).`)
  process.exit(1)
}

console.log('Client secret scan passed: 0 findings.')