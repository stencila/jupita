all: lint format cover build docs

setup:
	npm install --python=python2.7

lint:
	npm run lint

format:
	npm run format

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
