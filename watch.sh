trap "exit" INT TERM ERR
trap "kill 0" EXIT
(cd asrc; ./node_modules/.bin/tsc --watch) &
(cd casvm/emscripten; ./node_modules/.bin/tsc --watch) &
./node_modules/.bin/tsc --watch &
./node_modules/.bin/watchify --bare -d -o build/app.js build/index.js
wait
