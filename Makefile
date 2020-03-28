all: lint format check cover build docs

setup:
	npm install --python=python2.7

lint:
	npm run lint

format:
	npm run format

check:
	npm run check

test:
	npm test

cover:
	npm run test:cover

build:
	npm run build

docs:
	npm run docs
.PHONY: docs
