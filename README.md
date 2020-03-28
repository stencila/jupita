# 🌞 Jupita

#### Jupyter executor for executable documents

[![NPM](http://img.shields.io/npm/v/@stencila/jupita.svg?style=flat)](https://www.npmjs.com/package/@stencila/jupita)
[![Build status](https://travis-ci.org/stencila/jupita.svg?branch=master)](https://travis-ci.org/stencila/jupita)
[![Build status](https://ci.appveyor.com/api/projects/status/ipj7s8hm82809lj9/branch/master?svg=true)](https://ci.appveyor.com/project/nokome/jupita/)
[![Code coverage](https://codecov.io/gh/stencila/jupita/branch/master/graph/badge.svg)](https://codecov.io/gh/stencila/jupita)
[![Dependency status](https://david-dm.org/stencila/jupita.svg)](https://david-dm.org/stencila/node)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

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
