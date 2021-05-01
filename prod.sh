#!/bin/sh
yarn rimraf .next
mkdir tmp
yarn ttsc -p tsconfig.build.json 
mv src tmp/src
mv pages tmp/pages
mv prod-intermediary/* .
yarn rimraf prod-intermediary
yarn next build
yarn rimraf src pages
mv tmp/* .
yarn rimraf tmp prod-intermediary