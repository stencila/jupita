# 🌞 Jupita

#### Jupyter executor for executable documents

[![Build Status](https://dev.azure.com/stencila/stencila/_apis/build/status/stencila.jupita?branchName=master)](https://dev.azure.com/stencila/stencila/_build/latest?definitionId=6&branchName=master)
[![Code coverage](https://codecov.io/gh/stencila/jupita/branch/master/graph/badge.svg)](https://codecov.io/gh/stencila/jupita)
[![NPM](http://img.shields.io/npm/v/@stencila/jupita.svg?style=flat)](https://www.npmjs.com/package/@stencila/jupita)
[![Docs](https://img.shields.io/badge/docs-latest-blue.svg)](https://stencila.github.io/jupita/)

## 👋 Introduction

Stencila [Executa](https://github.com/stencila/executa) defines an API executing nodes within an executable document that is based on JSON-RPC and able to used across multiple transports (e.g. `stdio`, `http`, `ws`). This package acts a bridge between that API and the Jupyter API, which uses it's own [Jupyter Messaging Protocol (JMP)](http://jupyter-client.readthedocs.io/en/stable/messaging.html) and [ZeroMQ](http://zeromq.org/) as a transport. It allows users of Stencila's interfaces to delegate execution to Jupyter kernels, instead of, or in addition to, Stencila's own executors.

## 📦 Install

```bash
npm install @stencila/jupita --global --python=python2.7
```

This package relies on dependencies with native add-ons (`xeromq`). So you will need to have `node-gyp` installed (https://github.com/nodejs/node-gyp#readme). The `--python` flag is necessary because, on OSX and Windows, `node-gyp` is only compatible with Python 2.7.

## 🚀 Use

Register Jupita so that it can be discovered by other executors on your machine,

```bash
jupita register
```

## 📖 Docs

API documentation is available at https://stencila.github.io/jupita.

## 💬 Discuss

We love feedback. Create a [new issue](https://github.com/stencila/jupita/issues/new), add to [existing issues](https://github.com/stencila/jupita/issues) or [chat](https://gitter.im/stencila/stencila) with members of the community.

## 🛠️ Develop

Most development tasks can be run directly from `npm` or via `make` wrapper recipes.

| Task                           | `npm`           | `make`       |
| ------------------------------ | --------------- | ------------ |
| Install and setup dependencies | `npm install`   | `make setup` |
| Check code for lint            | `npm run lint`  | `make lint`  |
| Run tests                      | `npm test`      | `make test`  |
| Run tests with coverage        | `npm run cover` | `make cover` |
| Build documentation            | `npm run docs`  | `make docs`  |

## 🙏 Acknowledgments

Many thanks to the nteract community for [`kernelspecs`](https://github.com/nteract/kernelspecs) and
[`spawnteract`](https://github.com/nteract/spawnteract), and to Nicolas Riesco for [`jmp`](https://github.com/n-riesco/jmp),
all of which made this implementation far easier!
