# 🌞 Jupita

#### Jupyter executor for executable documents

[![Build Status](https://dev.azure.com/stencila/stencila/_apis/build/status/stencila.jupita?branchName=master)](https://dev.azure.com/stencila/stencila/_build/latest?definitionId=6&branchName=master)
[![Code coverage](https://codecov.io/gh/stencila/jupita/branch/master/graph/badge.svg)](https://codecov.io/gh/stencila/jupita)
[![NPM](http://img.shields.io/npm/v/@stencila/jupita.svg?style=flat)](https://www.npmjs.com/package/@stencila/jupita)
[![Docs](https://img.shields.io/badge/docs-latest-blue.svg)](https://stencila.github.io/jupita/)

## Introduction

Stencila [Executa](https://github.com/stencila/executor) defines an API executing nodes within an executable document that is based on JSON-RPC and able to used across multiple transports (e.g. `stdio`, `http`, `ws`). This package acts a bridge between that API and the Jupyter API, which uses it's own messaging protocol and `zeromq` as a transport. It allows users of Stencila's interfaces to delegate execution to Jupyter kernels, instead of, or in addition to, Stencila's own executors.

## Install

```bash
npm install @stencila/jupita --global --python=python2.7
```

This package relies on dependencies with native add-ons (`xeromq`). So you will need to have `node-gyp` installed (https://github.com/nodejs/node-gyp#readme). The `--python` flag is necessary because, on OSX and Windows, `node-gyp` is only compatible with Python 2.7.

## Use

```js
require('@stencila/jupita').run()
```

## Docs

API documentation is available at https://stencila.github.io/jupita.

## Discuss

We love feedback. Create a [new issue](https://github.com/stencila/jupita/issues/new), add to [existing issues](https://github.com/stencila/jupita/issues) or [chat](https://gitter.im/stencila/stencila) with members of the community.

### Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md).
