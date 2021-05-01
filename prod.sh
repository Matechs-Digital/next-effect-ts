#!/bin/sh
yarn rimraf .next
mkdir tmp
yarn ttsc -p tsconfig.build.json 
mv src tmp/src
mv goods tmp/goods
mv pages tmp/pages
mv prod-intermediary/* .
rm -rf prod-intermediary
yarn next build
rm -rf src goods pages
mv tmp/* .
rm -rf tmp prod-intermediary