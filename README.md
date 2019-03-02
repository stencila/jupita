## Stencila "compiler" for Jupyter

[![NPM](http://img.shields.io/npm/v/@stencila/jupyterer.svg?style=flat)](https://www.npmjs.com/package/@stencila/jupyterer)
[![Build status](https://travis-ci.org/stencila/jupyterer.svg?branch=master)](https://travis-ci.org/stencila/jupyterer)
[![Build status](https://ci.appveyor.com/api/projects/status/ipj7s8hm82809lj9/branch/master?svg=true)](https://ci.appveyor.com/project/nokome/jupyterer/)
[![Code coverage](https://codecov.io/gh/stencila/jupyterer/branch/master/graph/badge.svg)](https://codecov.io/gh/stencila/jupyterer)
[![Dependency status](https://david-dm.org/stencila/jupyterer.svg)](https://david-dm.org/stencila/node)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

### Install

```bash
npm install @stencila/jupyterer --global --python=python2.7
```

This package relies on dependencies with native add-ons (`xeromq`). So you will need to have `node-gyp` installed (https://github.com/nodejs/node-gyp#readme). The `--python` flag is necessary because, on OSX and Windows, `node-gyp` is only compatible with Python 2.7.

### Use

```js
require('@stencila/jupyterer').run()
```

### Docs

API documentation is available at https://stencila.github.io/jupyterer.

### Discuss

We love feedback. Create a [new issue](https://github.com/stencila/jupyterer/issues/new), add to [existing issues](https://github.com/stencila/jupyterer/issues) or [chat](https://gitter.im/stencila/stencila) with members of the community.

### Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md).
