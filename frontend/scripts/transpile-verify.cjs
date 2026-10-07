// 仅用于本地校验：用 tsc 把 TS 转成 CJS 后在 node 里跑，不依赖平台相关的 esbuild 二进制。
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const out = 'node_modules/.tmp-test'
fs.rmSync(out, { recursive: true, force: true })

// 简易 localStorage 垫片（无 TTL，足够纯前端数据层跑流程）。
const store = new Map()
const shim = `
const __mem = new Map()
globalThis.window = globalThis.window || {}
globalThis.window.localStorage = {
  getItem: (k) => (__mem.has(k) ? __mem.get(k) : null),
  setItem: (k, v) => __mem.set(k, String(v)),
  removeItem: (k) => __mem.delete(k),
  clear: () => __mem.clear(),
}
`
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'shim.cjs'), shim)

function transpile(src, dest) {
  let code = fs.readFileSync(src, 'utf8')
  code = code
    .replace(/from '@\//g, `from '${path.resolve(out, 'src')}/`)
    .replace(/require\('@\//g, `require('${path.resolve(out, 'src')}/`)
  const result = ts.transpileModule(code, {
    compilerOptions: { module: 'CommonJS', target: 'ES2020' },
  })
  let output = result.outputText
  // 给相对路径的 require 补 .js 后缀（CJS 在严格模式不做无扩展解析）。
  output = output.replace(/require\("(\.\.?\/[^"]+?)"\)/g, (m, spec) =>
    /\.(js|json)$/.test(spec) ? m : `require("${spec}.js")`,
  )
  const target = path.join(out, dest)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, output)
}

// 转译 src 下所有 .ts（保持目录层级），.vue 与测试无关，跳过。
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.ts')) transpile(full, path.relative('.', full).replace(/\.ts$/, '.js'))
  }
}
walk('src')

for (const [src, dest] of [
  ['scripts/verify-pit.mts', 'scripts/verify-pit.cjs'],
  ['scripts/verify-flow.mts', 'scripts/verify-flow.cjs'],
]) {
  transpile(src, dest)
}
console.log('transpiled')
