const express = require("express")
const app = express()
app.use('/asvm.wasm', express.static('casvm/emscripten/build/asvm.wasm'))
app.use('/resource.json', express.static('asrc/resource.json'))
app.use('/js', express.static('build'))
app.use('/images', express.static('asrc/images'))
app.use(express.static('static'))
app.listen(80, '0.0.0.0', () => console.log('express up and running'))