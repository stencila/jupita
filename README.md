# 🗎↔✨ Jupyteer
## A stencil compiler using Jupyter kernels

[![NPM](http://img.shields.io/npm/v/@stencila/jupyteer.svg?style=flat)](https://www.npmjs.com/package/@stencila/jupyteer)
[![Build status](https://travis-ci.org/stencila/jupyteer.svg?branch=master)](https://travis-ci.org/stencila/jupyteer)
[![Build status](https://ci.appveyor.com/api/projects/status/ipj7s8hm82809lj9/branch/master?svg=true)](https://ci.appveyor.com/project/nokome/jupyteer/)
[![Code coverage](https://codecov.io/gh/stencila/jupyteer/branch/master/graph/badge.svg)](https://codecov.io/gh/stencila/jupyteer)
[![Dependency status](https://david-dm.org/stencila/jupyteer.svg)](https://david-dm.org/stencila/node)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

<!-- Automatically generated TOC. Don't edit, `make docs` instead>

<!-- toc -->

- [Install](#install)
- [Use](#use)
- [Docs](#docs)
- [Discuss](#discuss)
- [Contribute](#contribute)

<!-- tocstop -->

### Install

```bash
npm install @stencila/jupyteer --global --python=python2.7
```

This package relies on dependencies with native add-ons (`xeromq`). So you will need to have `node-gyp` installed (https://github.com/nodejs/node-gyp#readme). The `--python` flag is necessary because, on OSX and Windows, `node-gyp` is only compatible with Python 2.7.

### Use

```js
require('@stencila/jupyteer').run()
```

### Docs

API documentation is available at https://stencila.github.io/jupyteer.

### Discuss

We love feedback. Create a [new issue](https://github.com/stencila/jupyteer/issues/new), add to [existing issues](https://github.com/stencila/jupyteer/issues) or [chat](https://gitter.im/stencila/stencila) with members of the community.

### Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md).
