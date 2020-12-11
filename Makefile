all: format lint cover build docs

setup:
	npm install --python=python2.7

format:
	npm run format

lint:
	npm run lint

test:
	npm test

cover:
	npm run test:cover

build:
	npm run build

register:
	npm run register

docs:
	npm run docs
.PHONY: docs
